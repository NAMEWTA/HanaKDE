#include <cerrno>
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <limits>
#include <string>
#include <utility>
#include <vector>

#ifdef _WIN32

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winternl.h>
#include <fcntl.h>
#include <io.h>
#include <cwctype>

namespace {

constexpr char kMagic[] = "HSF1";
constexpr std::uint8_t kProtocolVersion = 1;
constexpr std::uint8_t kWritten = 1;
constexpr std::uint8_t kConflict = 2;
constexpr std::uint8_t kUnsafe = 3;
constexpr std::uint32_t kMaxFrame = 64u * 1024u * 1024u;
constexpr std::uint32_t kMaxRoot = 32u * 1024u;
constexpr std::uint32_t kMaxSegment = 512u;
constexpr std::uint16_t kMaxSegments = 1024;
constexpr std::uint64_t kWindowsToUnixEpoch100ns = 116444736000000000ull;

#ifndef FILE_OPEN_REPARSE_POINT
#define FILE_OPEN_REPARSE_POINT 0x00200000u
#endif
#ifndef FILE_OPEN
#define FILE_OPEN 0x00000001u
#endif
#ifndef FILE_CREATE
#define FILE_CREATE 0x00000002u
#endif
#ifndef FILE_DIRECTORY_FILE
#define FILE_DIRECTORY_FILE 0x00000001u
#endif
#ifndef FILE_TRAVERSE
#define FILE_TRAVERSE 0x00000020u
#endif
#ifndef FILE_NON_DIRECTORY_FILE
#define FILE_NON_DIRECTORY_FILE 0x00000040u
#endif
#ifndef FILE_SYNCHRONOUS_IO_NONALERT
#define FILE_SYNCHRONOUS_IO_NONALERT 0x00000020u
#endif
#ifndef STATUS_OBJECT_NAME_NOT_FOUND
#define STATUS_OBJECT_NAME_NOT_FOUND ((NTSTATUS)0xC0000034L)
#endif
#ifndef STATUS_OBJECT_PATH_NOT_FOUND
#define STATUS_OBJECT_PATH_NOT_FOUND ((NTSTATUS)0xC000003Au)
#endif
#ifndef STATUS_OBJECT_NAME_COLLISION
#define STATUS_OBJECT_NAME_COLLISION ((NTSTATUS)0xC0000035L)
#endif
#ifndef NT_SUCCESS
#define NT_SUCCESS(status) ((status) >= 0)
#endif

struct Identity {
  std::uint64_t device = 0;
  std::uint64_t inode = 0;
  std::uint64_t birthtime_ns = 0;
};

struct FileProof {
  Identity identity;
  std::uint64_t mtime_ns = 0;
  std::uint64_t size = 0;
};

struct Request {
  std::wstring root;
  std::vector<std::wstring> segments;
  Identity root_identity;
  std::vector<Identity> ancestors;
  bool has_final = false;
  FileProof final;
  std::vector<std::uint8_t> content;
};

class Handle {
 public:
  explicit Handle(HANDLE value = INVALID_HANDLE_VALUE) : value_(value) {}
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  Handle(Handle&& other) noexcept : value_(other.value_) {
    other.value_ = INVALID_HANDLE_VALUE;
  }
  Handle& operator=(Handle&& other) noexcept {
    if (this != &other) {
      reset();
      value_ = other.value_;
      other.value_ = INVALID_HANDLE_VALUE;
    }
    return *this;
  }
  ~Handle() { reset(); }
  HANDLE get() const { return value_; }
  explicit operator bool() const { return value_ != INVALID_HANDLE_VALUE; }
  void reset(HANDLE value = INVALID_HANDLE_VALUE) {
    if (value_ != INVALID_HANDLE_VALUE) CloseHandle(value_);
    value_ = value;
  }

 private:
  HANDLE value_;
};

class Reader {
 public:
  explicit Reader(const std::vector<std::uint8_t>& body) : body_(body) {}

  bool bytes(void* output, std::size_t length) {
    if (offset_ > body_.size() || length > body_.size() - offset_) return false;
    if (length > 0) std::memcpy(output, body_.data() + offset_, length);
    offset_ += length;
    return true;
  }
  bool u8(std::uint8_t& value) { return bytes(&value, 1); }
  bool u16(std::uint16_t& value) {
    std::uint8_t raw[2];
    if (!bytes(raw, sizeof(raw))) return false;
    value = (static_cast<std::uint16_t>(raw[0]) << 8) | raw[1];
    return true;
  }
  bool u32(std::uint32_t& value) {
    std::uint8_t raw[4];
    if (!bytes(raw, sizeof(raw))) return false;
    value = (static_cast<std::uint32_t>(raw[0]) << 24)
      | (static_cast<std::uint32_t>(raw[1]) << 16)
      | (static_cast<std::uint32_t>(raw[2]) << 8) | raw[3];
    return true;
  }
  bool u64(std::uint64_t& value) {
    std::uint8_t raw[8];
    if (!bytes(raw, sizeof(raw))) return false;
    value = 0;
    for (std::uint8_t byte : raw) value = (value << 8) | byte;
    return true;
  }
  bool utf8String(std::wstring& value, std::uint32_t maximum) {
    std::uint32_t length = 0;
    if (!u32(length) || length == 0 || length > maximum || length > body_.size() - offset_) {
      return false;
    }
    const auto* raw = body_.data() + offset_;
    if (std::memchr(raw, 0, length) != nullptr) return false;
    const int chars = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
      reinterpret_cast<const char*>(raw), static_cast<int>(length), nullptr, 0);
    if (chars <= 0) return false;
    value.resize(static_cast<std::size_t>(chars));
    if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
      reinterpret_cast<const char*>(raw), static_cast<int>(length), value.data(), chars) != chars) {
      return false;
    }
    offset_ += length;
    return true;
  }
  bool identity(Identity& value) {
    return u64(value.device) && u64(value.inode) && u64(value.birthtime_ns);
  }
  bool fileProof(FileProof& value) {
    return identity(value.identity) && u64(value.mtime_ns) && u64(value.size);
  }
  bool finished() const { return offset_ == body_.size(); }

 private:
  const std::vector<std::uint8_t>& body_;
  std::size_t offset_ = 0;
};

std::uint64_t unixTimeNs(const FILETIME& value) {
  ULARGE_INTEGER raw{};
  raw.LowPart = value.dwLowDateTime;
  raw.HighPart = value.dwHighDateTime;
  if (raw.QuadPart < kWindowsToUnixEpoch100ns) return 0;
  return (raw.QuadPart - kWindowsToUnixEpoch100ns) * 100ull;
}

bool identityAndProof(HANDLE handle, Identity& identity, FileProof* proof = nullptr) {
  BY_HANDLE_FILE_INFORMATION info{};
  if (!GetFileInformationByHandle(handle, &info)) return false;
  identity = Identity{
    static_cast<std::uint64_t>(info.dwVolumeSerialNumber),
    (static_cast<std::uint64_t>(info.nFileIndexHigh) << 32) | info.nFileIndexLow,
    unixTimeNs(info.ftCreationTime),
  };
  if (proof) {
    proof->identity = identity;
    proof->mtime_ns = unixTimeNs(info.ftLastWriteTime);
    proof->size = (static_cast<std::uint64_t>(info.nFileSizeHigh) << 32) | info.nFileSizeLow;
  }
  return true;
}

bool sameIdentity(const Identity& left, const Identity& right) {
  return left.device == right.device
    && left.inode == right.inode
    && left.birthtime_ns == right.birthtime_ns;
}

bool isReparsePoint(HANDLE handle, bool& result) {
  BY_HANDLE_FILE_INFORMATION info{};
  if (!GetFileInformationByHandle(handle, &info)) return false;
  result = (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
  return true;
}

bool isDirectory(HANDLE handle, bool& result) {
  BY_HANDLE_FILE_INFORMATION info{};
  if (!GetFileInformationByHandle(handle, &info)) return false;
  result = (info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
  return true;
}

std::wstring normalizePath(std::wstring value) {
  std::replace(value.begin(), value.end(), L'/', L'\\');
  while (value.size() > 1 && value.back() == L'\\') value.pop_back();
  std::transform(value.begin(), value.end(), value.begin(), [](wchar_t ch) {
    return static_cast<wchar_t>(std::towlower(ch));
  });
  return value;
}

std::wstring finalPath(HANDLE handle) {
  std::vector<wchar_t> buffer(512);
  for (;;) {
    const DWORD length = GetFinalPathNameByHandleW(handle, buffer.data(),
      static_cast<DWORD>(buffer.size()), FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
    if (length == 0) return {};
    if (length < buffer.size() - 1) return normalizePath(std::wstring(buffer.data(), length));
    if (buffer.size() >= 32768) return {};
    buffer.resize(buffer.size() * 2);
  }
}

bool isSameOrInside(const std::wstring& root, const std::wstring& candidate) {
  const std::wstring normalizedRoot = normalizePath(root);
  const std::wstring normalizedCandidate = normalizePath(candidate);
  if (normalizedRoot.empty() || normalizedCandidate == normalizedRoot) return !normalizedRoot.empty();
  if (normalizedCandidate.size() <= normalizedRoot.size()
      || normalizedCandidate.compare(0, normalizedRoot.size(), normalizedRoot) != 0) return false;
  return normalizedRoot.back() == L'\\'
    || normalizedCandidate[normalizedRoot.size()] == L'\\';
}

bool isSafeSegment(const std::wstring& segment) {
  if (segment.empty() || segment == L"." || segment == L".."
      || segment.find_first_of(L"\\/") != std::wstring::npos) {
    return false;
  }
  for (const wchar_t character : segment) {
    if (character < 0x20 || character == 0x7f || character == L':'
        || character == L'<' || character == L'>' || character == L'\"'
        || character == L'|' || character == L'?' || character == L'*') {
      return false;
    }
  }
  return segment.back() != L'.' && segment.back() != L' ';
}

using NtCreateFileFn = NTSTATUS (NTAPI*)(PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES,
  PIO_STATUS_BLOCK, PLARGE_INTEGER, ULONG, ULONG, ULONG, ULONG, PVOID, ULONG);

NtCreateFileFn resolveNtCreateFile() {
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (!ntdll) return nullptr;
  return reinterpret_cast<NtCreateFileFn>(GetProcAddress(ntdll, "NtCreateFile"));
}

Handle openRelative(HANDLE parent, const std::wstring& segment, ACCESS_MASK access,
  ULONG disposition, ULONG createOptions, NTSTATUS& status) {
  auto ntCreateFile = resolveNtCreateFile();
  if (!ntCreateFile || segment.empty() || segment.size() > 32767) {
    status = STATUS_OBJECT_PATH_NOT_FOUND;
    return Handle();
  }
  UNICODE_STRING name{};
  name.Length = static_cast<USHORT>(segment.size() * sizeof(wchar_t));
  name.MaximumLength = name.Length;
  name.Buffer = const_cast<PWSTR>(segment.c_str());
  OBJECT_ATTRIBUTES attributes{};
  attributes.Length = sizeof(attributes);
  attributes.RootDirectory = parent;
  attributes.ObjectName = &name;
  attributes.Attributes = OBJ_CASE_INSENSITIVE;
  IO_STATUS_BLOCK io{};
  HANDLE handle = INVALID_HANDLE_VALUE;
  status = ntCreateFile(&handle, access, &attributes, &io, nullptr,
    FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    disposition, createOptions | FILE_OPEN_REPARSE_POINT | FILE_SYNCHRONOUS_IO_NONALERT,
    nullptr, 0);
  return NT_SUCCESS(status) ? Handle(handle) : Handle();
}

Handle openRoot(const std::wstring& root) {
  return Handle(CreateFileW(root.c_str(), FILE_READ_ATTRIBUTES | FILE_LIST_DIRECTORY | FILE_TRAVERSE | SYNCHRONIZE,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
}

bool readAll(std::vector<std::uint8_t>& output) {
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  if (!input || input == INVALID_HANDLE_VALUE) return false;
  std::uint8_t buffer[16 * 1024];
  for (;;) {
    DWORD count = 0;
    if (!ReadFile(input, buffer, sizeof(buffer), &count, nullptr)) {
      // Node closes the child stdin pipe after writing the request. On
      // Windows that EOF is reported as ERROR_BROKEN_PIPE rather than a
      // successful zero-byte read.
      return GetLastError() == ERROR_BROKEN_PIPE;
    }
    if (count == 0) return true;
    output.insert(output.end(), buffer, buffer + count);
    if (output.size() > kMaxFrame + 4u) return false;
  }
}

bool writeAll(const std::vector<std::uint8_t>& output) {
  HANDLE handle = GetStdHandle(STD_OUTPUT_HANDLE);
  if (!handle || handle == INVALID_HANDLE_VALUE) return false;
  std::size_t offset = 0;
  while (offset < output.size()) {
    const DWORD requested = static_cast<DWORD>(std::min<std::size_t>(output.size() - offset, 1u << 20));
    DWORD written = 0;
    if (!WriteFile(handle, output.data() + offset, requested, &written, nullptr) || written == 0) return false;
    offset += written;
  }
  return true;
}

std::vector<std::uint8_t> response(std::uint8_t status, std::uint64_t mtime = 0, std::uint64_t size = 0) {
  std::vector<std::uint8_t> body(22, 0);
  std::memcpy(body.data(), kMagic, 4);
  body[4] = kProtocolVersion;
  body[5] = status;
  for (int index = 0; index < 8; ++index) {
    body[6 + index] = static_cast<std::uint8_t>(mtime >> (56 - index * 8));
    body[14 + index] = static_cast<std::uint8_t>(size >> (56 - index * 8));
  }
  std::vector<std::uint8_t> frame(4 + body.size());
  const std::uint32_t length = static_cast<std::uint32_t>(body.size());
  frame[0] = static_cast<std::uint8_t>(length >> 24);
  frame[1] = static_cast<std::uint8_t>(length >> 16);
  frame[2] = static_cast<std::uint8_t>(length >> 8);
  frame[3] = static_cast<std::uint8_t>(length);
  std::copy(body.begin(), body.end(), frame.begin() + 4);
  return frame;
}

bool parseRequest(const std::vector<std::uint8_t>& frame, Request& request) {
  if (frame.size() < 4) return false;
  const std::uint32_t length = (static_cast<std::uint32_t>(frame[0]) << 24)
    | (static_cast<std::uint32_t>(frame[1]) << 16)
    | (static_cast<std::uint32_t>(frame[2]) << 8) | frame[3];
  if (length > kMaxFrame || frame.size() != static_cast<std::size_t>(length) + 4u) return false;
  std::vector<std::uint8_t> body(frame.begin() + 4, frame.end());
  Reader reader(body);
  char magic[4];
  std::uint8_t version = 0;
  std::uint8_t flags = 0;
  std::uint8_t hasFinal = 0;
  std::uint16_t segmentCount = 0;
  if (!reader.bytes(magic, sizeof(magic)) || std::memcmp(magic, kMagic, 4) != 0
      || !reader.u8(version) || version != kProtocolVersion || !reader.u8(flags) || flags != 1
      || !reader.u8(hasFinal) || hasFinal > 1 || !reader.u16(segmentCount)
      || segmentCount == 0 || segmentCount > kMaxSegments
      || !reader.utf8String(request.root, kMaxRoot)) {
    return false;
  }
  if (!(request.root.size() >= 3 && std::iswalpha(request.root[0]) && request.root[1] == L':'
      && (request.root[2] == L'\\' || request.root[2] == L'/'))
      && !(request.root.size() >= 2 && request.root[0] == L'\\' && request.root[1] == L'\\')) {
    return false;
  }
  request.has_final = hasFinal == 1;
  request.segments.reserve(segmentCount);
  for (std::uint16_t index = 0; index < segmentCount; ++index) {
    std::wstring segment;
    if (!reader.utf8String(segment, kMaxSegment) || !isSafeSegment(segment)) {
      return false;
    }
    request.segments.push_back(std::move(segment));
  }
  if (!reader.identity(request.root_identity)) return false;
  request.ancestors.reserve(segmentCount - 1);
  for (std::uint16_t index = 1; index < segmentCount; ++index) {
    Identity identity;
    if (!reader.identity(identity)) return false;
    request.ancestors.push_back(identity);
  }
  if (request.has_final && !reader.fileProof(request.final)) return false;
  std::uint32_t contentLength = 0;
  if (!reader.u32(contentLength) || contentLength > kMaxFrame || contentLength > body.size()) return false;
  request.content.resize(contentLength);
  return reader.bytes(request.content.data(), contentLength) && reader.finished();
}

std::vector<std::uint8_t> performWrite(const Request& request) {
  if (request.root.empty() || request.segments.empty()) return response(kUnsafe);
  Handle root = openRoot(request.root);
  if (!root) return response(kUnsafe);
  bool rootReparse = false;
  bool rootDirectory = false;
  Identity rootIdentity;
  if (!isReparsePoint(root.get(), rootReparse) || rootReparse
      || !isDirectory(root.get(), rootDirectory) || !rootDirectory
      || !identityAndProof(root.get(), rootIdentity) || !sameIdentity(rootIdentity, request.root_identity)) {
    return response(kConflict);
  }
  const std::wstring rootFinal = finalPath(root.get());
  if (rootFinal.empty()) return response(kUnsafe);

  Handle parent;
  HANDLE duplicated = INVALID_HANDLE_VALUE;
  if (!DuplicateHandle(GetCurrentProcess(), root.get(), GetCurrentProcess(), &duplicated,
      0, FALSE, DUPLICATE_SAME_ACCESS)) return response(kUnsafe);
  parent.reset(duplicated);

  for (std::size_t index = 0; index + 1 < request.segments.size(); ++index) {
    NTSTATUS status = 0;
    Handle child = openRelative(parent.get(), request.segments[index],
      FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | SYNCHRONIZE, FILE_OPEN, FILE_DIRECTORY_FILE, status);
    if (!child) {
      return response(status == STATUS_OBJECT_NAME_NOT_FOUND || status == STATUS_OBJECT_PATH_NOT_FOUND
        ? kConflict : kUnsafe);
    }
    bool reparse = false;
    bool directory = false;
    Identity identity;
    if (!isReparsePoint(child.get(), reparse) || reparse || !isDirectory(child.get(), directory)
        || !directory || !identityAndProof(child.get(), identity)
        || !sameIdentity(identity, request.ancestors[index]) || !isSameOrInside(rootFinal, finalPath(child.get()))) {
      return response(kConflict);
    }
    parent = std::move(child);
  }

  NTSTATUS status = 0;
  const ACCESS_MASK access = request.has_final
    ? (GENERIC_READ | GENERIC_WRITE | FILE_READ_ATTRIBUTES | SYNCHRONIZE)
    : (GENERIC_WRITE | FILE_READ_ATTRIBUTES | SYNCHRONIZE);
  const ULONG options = request.has_final ? FILE_NON_DIRECTORY_FILE : FILE_NON_DIRECTORY_FILE;
  Handle target = openRelative(parent.get(), request.segments.back(), access,
    request.has_final ? FILE_OPEN : FILE_CREATE, options, status);
  if (!target) {
    return response(status == STATUS_OBJECT_NAME_COLLISION ? kConflict
      : (status == STATUS_OBJECT_NAME_NOT_FOUND || status == STATUS_OBJECT_PATH_NOT_FOUND ? kConflict : kUnsafe));
  }
  bool reparse = false;
  bool directory = false;
  Identity identity;
  FileProof current;
  if (!isReparsePoint(target.get(), reparse) || reparse || !isDirectory(target.get(), directory)
      || directory || !identityAndProof(target.get(), identity, &current)
      || !isSameOrInside(rootFinal, finalPath(target.get()))) return response(kConflict);
  if (request.has_final && (!sameIdentity(current.identity, request.final.identity)
      || current.mtime_ns != request.final.mtime_ns || current.size != request.final.size)) {
    return response(kConflict, current.mtime_ns, current.size);
  }
  if (request.content.size() > static_cast<std::size_t>(std::numeric_limits<DWORD>::max())) return response(kUnsafe);
  LARGE_INTEGER zero{};
  if (request.has_final && (!SetFilePointerEx(target.get(), zero, nullptr, FILE_BEGIN)
      || !SetEndOfFile(target.get()))) return response(kUnsafe);
  std::size_t offset = 0;
  while (offset < request.content.size()) {
    const DWORD amount = static_cast<DWORD>(std::min<std::size_t>(request.content.size() - offset, 1u << 20));
    DWORD written = 0;
    if (!WriteFile(target.get(), request.content.data() + offset, amount, &written, nullptr) || written == 0) {
      return response(kUnsafe);
    }
    offset += written;
  }
  if (!FlushFileBuffers(target.get()) || !identityAndProof(target.get(), identity, &current)) return response(kUnsafe);
  return response(kWritten, current.mtime_ns, current.size);
}

} // namespace

int main() {
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
  std::vector<std::uint8_t> frame;
  Request request;
  if (!readAll(frame) || !parseRequest(frame, request)) return 1;
  return writeAll(performWrite(request)) ? 0 : 1;
}

#else

#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#ifndef O_CLOEXEC
#define O_CLOEXEC 0
#endif
#ifndef O_DIRECTORY
#define O_DIRECTORY 0
#endif
#ifndef O_NOFOLLOW
#define HANA_POSIX_NO_NOFOLLOW 1
#define O_NOFOLLOW 0
#endif

namespace {

constexpr char kMagic[] = "HSF1";
constexpr std::uint8_t kProtocolVersion = 1;
constexpr std::uint8_t kWritten = 1;
constexpr std::uint8_t kConflict = 2;
constexpr std::uint8_t kUnsafe = 3;
constexpr std::uint32_t kMaxFrame = 64u * 1024u * 1024u;
constexpr std::uint32_t kMaxRoot = 32u * 1024u;
constexpr std::uint32_t kMaxSegment = 512u;
constexpr std::uint16_t kMaxSegments = 1024;

struct Identity {
  std::uint64_t device = 0;
  std::uint64_t inode = 0;
  std::uint64_t birthtime_ns = 0;
};

struct FileProof {
  Identity identity;
  std::uint64_t mtime_ns = 0;
  std::uint64_t size = 0;
};

struct Request {
  std::string root;
  std::vector<std::string> segments;
  Identity root_identity;
  std::vector<Identity> ancestors;
  bool has_final = false;
  FileProof final;
  std::vector<std::uint8_t> content;
};

class Fd {
 public:
  explicit Fd(int fd = -1) : fd_(fd) {}
  Fd(const Fd&) = delete;
  Fd& operator=(const Fd&) = delete;
  Fd(Fd&& other) noexcept : fd_(other.fd_) { other.fd_ = -1; }
  Fd& operator=(Fd&& other) noexcept {
    if (this != &other) {
      reset();
      fd_ = other.fd_;
      other.fd_ = -1;
    }
    return *this;
  }
  ~Fd() { reset(); }
  int get() const { return fd_; }
  explicit operator bool() const { return fd_ >= 0; }
  void reset(int fd = -1) {
    if (fd_ >= 0) close(fd_);
    fd_ = fd;
  }

 private:
  int fd_;
};

class Reader {
 public:
  explicit Reader(const std::vector<std::uint8_t>& body) : body_(body) {}

  bool bytes(void* output, std::size_t length) {
    if (offset_ > body_.size() || length > body_.size() - offset_) return false;
    std::memcpy(output, body_.data() + offset_, length);
    offset_ += length;
    return true;
  }
  bool u8(std::uint8_t& value) { return bytes(&value, sizeof(value)); }
  bool u16(std::uint16_t& value) {
    std::uint8_t raw[2];
    if (!bytes(raw, sizeof(raw))) return false;
    value = (static_cast<std::uint16_t>(raw[0]) << 8) | raw[1];
    return true;
  }
  bool u32(std::uint32_t& value) {
    std::uint8_t raw[4];
    if (!bytes(raw, sizeof(raw))) return false;
    value = (static_cast<std::uint32_t>(raw[0]) << 24)
      | (static_cast<std::uint32_t>(raw[1]) << 16)
      | (static_cast<std::uint32_t>(raw[2]) << 8) | raw[3];
    return true;
  }
  bool u64(std::uint64_t& value) {
    std::uint8_t raw[8];
    if (!bytes(raw, sizeof(raw))) return false;
    value = 0;
    for (std::uint8_t byte : raw) value = (value << 8) | byte;
    return true;
  }
  bool string(std::string& value, std::uint32_t maximum) {
    std::uint32_t length = 0;
    if (!u32(length) || length == 0 || length > maximum || length > body_.size() - offset_) {
      return false;
    }
    value.assign(reinterpret_cast<const char*>(body_.data() + offset_), length);
    offset_ += length;
    return value.find('\0') == std::string::npos;
  }
  bool identity(Identity& value) {
    return u64(value.device) && u64(value.inode) && u64(value.birthtime_ns);
  }
  bool file_proof(FileProof& value) {
    return identity(value.identity) && u64(value.mtime_ns) && u64(value.size);
  }
  bool finished() const { return offset_ == body_.size(); }

 private:
  const std::vector<std::uint8_t>& body_;
  std::size_t offset_ = 0;
};

std::uint64_t birthtimeNs(const struct stat& stat) {
#if defined(__APPLE__)
  return static_cast<std::uint64_t>(stat.st_birthtimespec.tv_sec) * 1000000000ull
    + static_cast<std::uint64_t>(stat.st_birthtimespec.tv_nsec);
#elif defined(__linux__)
  // Node obtains Linux birthtimeNs from statx(). A plain struct stat has no
  // birthtime field; ctime is not equivalent and must never be used as proof.
  // The build entry skips Linux until a statx-specific backend is authorized.
  return 0;
#else
  return 0;
#endif
}

Identity identityFromStat(const struct stat& stat) {
  return Identity{
    static_cast<std::uint64_t>(stat.st_dev),
    static_cast<std::uint64_t>(stat.st_ino),
    birthtimeNs(stat),
  };
}

bool sameIdentity(const Identity& left, const Identity& right) {
  return left.device == right.device
    && left.inode == right.inode
    && left.birthtime_ns == right.birthtime_ns;
}

std::uint64_t mtimeNs(const struct stat& stat) {
#if defined(__APPLE__)
  return static_cast<std::uint64_t>(stat.st_mtimespec.tv_sec) * 1000000000ull
    + static_cast<std::uint64_t>(stat.st_mtimespec.tv_nsec);
#else
  return static_cast<std::uint64_t>(stat.st_mtim.tv_sec) * 1000000000ull
    + static_cast<std::uint64_t>(stat.st_mtim.tv_nsec);
#endif
}

bool isSafeSegment(const std::string& segment) {
  if (segment.empty() || segment == "." || segment == ".."
      || segment.find_first_of("\\/") != std::string::npos) {
    return false;
  }
  for (const unsigned char character : segment) {
    if (character < 0x20 || character == 0x7f || character == ':'
        || character == '<' || character == '>' || character == '"'
        || character == '|' || character == '?' || character == '*') {
      return false;
    }
  }
  return segment.back() != '.' && segment.back() != ' ';
}

bool readAll(std::vector<std::uint8_t>& output) {
  std::uint8_t buffer[16 * 1024];
  while (true) {
    std::cin.read(reinterpret_cast<char*>(buffer), sizeof(buffer));
    const std::streamsize count = std::cin.gcount();
    if (count > 0) output.insert(output.end(), buffer, buffer + count);
    if (output.size() > kMaxFrame + 4u) return false;
    if (std::cin.eof()) return true;
    if (std::cin.fail()) return false;
  }
}

bool parseRequest(const std::vector<std::uint8_t>& frame, Request& request) {
  if (frame.size() < 4) return false;
  const std::uint32_t length = (static_cast<std::uint32_t>(frame[0]) << 24)
    | (static_cast<std::uint32_t>(frame[1]) << 16)
    | (static_cast<std::uint32_t>(frame[2]) << 8) | frame[3];
  if (length > kMaxFrame || frame.size() != static_cast<std::size_t>(length) + 4u) return false;
  std::vector<std::uint8_t> body(frame.begin() + 4, frame.end());
  Reader reader(body);
  char magic[4];
  std::uint8_t version = 0;
  std::uint8_t flags = 0;
  std::uint8_t hasFinal = 0;
  std::uint16_t segmentCount = 0;
  if (!reader.bytes(magic, sizeof(magic)) || std::memcmp(magic, kMagic, 4) != 0
      || !reader.u8(version) || version != kProtocolVersion || !reader.u8(flags) || flags != 1
      || !reader.u8(hasFinal) || hasFinal > 1 || !reader.u16(segmentCount)
      || segmentCount == 0 || segmentCount > kMaxSegments || !reader.string(request.root, kMaxRoot)) {
    return false;
  }
  if (request.root.empty() || request.root.front() != '/') return false;
  request.has_final = hasFinal == 1;
  request.segments.reserve(segmentCount);
  for (std::uint16_t index = 0; index < segmentCount; ++index) {
    std::string segment;
    if (!reader.string(segment, kMaxSegment) || !isSafeSegment(segment)) {
      return false;
    }
    request.segments.push_back(std::move(segment));
  }
  if (!reader.identity(request.root_identity)) return false;
  request.ancestors.reserve(segmentCount - 1);
  for (std::uint16_t index = 1; index < segmentCount; ++index) {
    Identity identity;
    if (!reader.identity(identity)) return false;
    request.ancestors.push_back(identity);
  }
  if (request.has_final && !reader.file_proof(request.final)) return false;
  std::uint32_t contentLength = 0;
  if (!reader.u32(contentLength) || contentLength > kMaxFrame || contentLength > body.size()) {
    return false;
  }
  request.content.resize(contentLength);
  if (!reader.bytes(request.content.data(), contentLength) || !reader.finished()) return false;
  return true;
}

std::vector<std::uint8_t> response(std::uint8_t status, std::uint64_t mtime = 0, std::uint64_t size = 0) {
  std::vector<std::uint8_t> body(22, 0);
  std::memcpy(body.data(), kMagic, 4);
  body[4] = kProtocolVersion;
  body[5] = status;
  for (int index = 0; index < 8; ++index) {
    body[6 + index] = static_cast<std::uint8_t>(mtime >> (56 - index * 8));
    body[14 + index] = static_cast<std::uint8_t>(size >> (56 - index * 8));
  }
  std::vector<std::uint8_t> frame(4 + body.size());
  const std::uint32_t length = static_cast<std::uint32_t>(body.size());
  frame[0] = static_cast<std::uint8_t>(length >> 24);
  frame[1] = static_cast<std::uint8_t>(length >> 16);
  frame[2] = static_cast<std::uint8_t>(length >> 8);
  frame[3] = static_cast<std::uint8_t>(length);
  std::copy(body.begin(), body.end(), frame.begin() + 4);
  return frame;
}

bool writeAll(int fd, const std::vector<std::uint8_t>& content) {
  std::size_t offset = 0;
  while (offset < content.size()) {
    const ssize_t written = ::write(fd, content.data() + offset, content.size() - offset);
    if (written <= 0) return false;
    offset += static_cast<std::size_t>(written);
  }
  return true;
}

std::vector<std::uint8_t> performWrite(const Request& request) {
  if (request.root.empty() || request.segments.empty()) return response(kUnsafe);
  Fd root(open(request.root.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
  if (!root) return response(kUnsafe);
  struct stat rootStat;
  if (fstat(root.get(), &rootStat) != 0 || !S_ISDIR(rootStat.st_mode)
      || !sameIdentity(identityFromStat(rootStat), request.root_identity)) {
    return response(kConflict);
  }

  Fd parent(dup(root.get()));
  if (!parent) return response(kUnsafe);
  std::vector<Fd> ancestors;
  ancestors.reserve(request.ancestors.size());
  for (std::size_t index = 0; index + 1 < request.segments.size(); ++index) {
    Fd child(openat(parent.get(), request.segments[index].c_str(),
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
    if (!child) return response(errno == ENOENT ? kConflict : kUnsafe);
    struct stat childStat;
    if (fstat(child.get(), &childStat) != 0 || !S_ISDIR(childStat.st_mode)
        || !sameIdentity(identityFromStat(childStat), request.ancestors[index])) {
      return response(kConflict);
    }
    ancestors.push_back(std::move(child));
    parent = Fd(dup(ancestors.back().get()));
    if (!parent) return response(kUnsafe);
  }

  const std::string& finalName = request.segments.back();
  Fd target;
  if (request.has_final) {
    target = Fd(openat(parent.get(), finalName.c_str(), O_RDWR | O_NOFOLLOW | O_CLOEXEC));
    if (!target) return response(errno == ENOENT ? kConflict : kUnsafe);
    struct stat before;
    if (fstat(target.get(), &before) != 0 || !S_ISREG(before.st_mode)) return response(kConflict);
    const FileProof current{identityFromStat(before), mtimeNs(before), static_cast<std::uint64_t>(before.st_size)};
    if (!sameIdentity(current.identity, request.final.identity)
        || current.mtime_ns != request.final.mtime_ns || current.size != request.final.size) {
      return response(kConflict, current.mtime_ns, current.size);
    }
    if (ftruncate(target.get(), 0) != 0 || !writeAll(target.get(), request.content)) return response(kUnsafe);
  } else {
    target = Fd(openat(parent.get(), finalName.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600));
    if (!target) return response(errno == EEXIST ? kConflict : kUnsafe);
    if (!writeAll(target.get(), request.content)) return response(kUnsafe);
  }
  if (fsync(target.get()) != 0) return response(kUnsafe);
  struct stat after;
  if (fstat(target.get(), &after) != 0 || !S_ISREG(after.st_mode)) return response(kUnsafe);
  return response(kWritten, mtimeNs(after), static_cast<std::uint64_t>(after.st_size));
}

} // namespace

int main() {
#ifdef HANA_POSIX_NO_NOFOLLOW
  return 1;
#else
  std::vector<std::uint8_t> frame;
  Request request;
  if (!readAll(frame) || !parseRequest(frame, request)) return 1;
  const auto result = performWrite(request);
  std::cout.write(reinterpret_cast<const char*>(result.data()), static_cast<std::streamsize>(result.size()));
  std::cout.flush();
  return std::cout ? 0 : 1;
#endif
}

#endif
