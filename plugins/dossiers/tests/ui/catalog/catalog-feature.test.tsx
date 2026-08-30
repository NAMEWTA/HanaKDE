/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CatalogFeature,
  CatalogUiError,
  type CatalogClient,
  type CatalogDossier,
  type CatalogType,
} from "../../../src/ui/catalog/index.tsx";

const organization: CatalogType = {
  id: "typ_builtin_organization",
  key: "organization",
  name: "组织",
  builtin: true,
  fields: [
    { id: "fld_org_address", key: "address", label: "地址", type: "long_text", order: 0, required: false },
    { id: "fld_org_active", key: "active", label: "启用", type: "boolean", order: 1, required: false },
  ],
};

const dossier: CatalogDossier = {
  id: "dos_01hzguangzhou",
  name: "广州数据交易所",
  typeId: organization.id,
  type: organization,
  fields: { fld_org_address: "广州市南沙区", fld_unknown_legacy: "历史字段" },
  tags: ["数据要素", "机构"],
  contacts: [{ contactId: "con_01hzzhangsan", role: "业务联系人", contact: { id: "con_01hzzhangsan", name: "张三", organization: "广州数据交易所", title: "业务经理" } }],
  documentCount: 12,
  revision: 3,
};

function client(overrides: Partial<CatalogClient> = {}): CatalogClient {
  return {
    listTypes: vi.fn().mockResolvedValue({ items: [organization] }),
    search: vi.fn().mockResolvedValue({
      items: [{ dossierId: dossier.id, name: dossier.name, typeId: organization.id, typeName: organization.name, tags: dossier.tags, documentCount: 12, revision: 3 }],
      nextCursor: null,
      stale: false,
      degraded: false,
    }),
    getDossier: vi.fn().mockResolvedValue(dossier),
    createDossier: vi.fn().mockResolvedValue(dossier),
    updateDossier: vi.fn().mockResolvedValue({ ...dossier, name: "广州数据交易所（更新）", revision: 4 }),
    rebuildIndex: vi.fn().mockResolvedValue({ status: "ready" }),
    ...overrides,
  };
}

describe("CatalogFeature", () => {
  afterEach(() => cleanup());

  it("loads the metadata directory, searches, selects, and saves with the expected revision", async () => {
    const api = client();
    render(<CatalogFeature client={api} />);

    fireEvent.click(await screen.findByRole("button", { name: /广州数据交易所/ }));
    expect(await screen.findByRole("heading", { name: "广州数据交易所" })).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByDisplayValue("历史字段")).toHaveAttribute("readonly");

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索档案元数据" }), { target: { value: "南沙" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ query: "南沙" })));

    fireEvent.change(screen.getByLabelText("档案名称"), { target: { value: "广州数据交易所（更新）" } });
    fireEvent.click(screen.getByRole("button", { name: "保存档案" }));
    await waitFor(() => expect(api.updateDossier).toHaveBeenCalledWith(dossier.id, 3, expect.objectContaining({ name: "广州数据交易所（更新）" })));
  });

  it("creates from a type template and keeps field validation local", async () => {
    const api = client();
    render(<CatalogFeature client={api} />);
    await screen.findByText("广州数据交易所");

    fireEvent.click(screen.getByRole("button", { name: "新建档案" }));
    fireEvent.click(screen.getByRole("button", { name: "创建档案" }));
    expect(screen.getByText("请输入档案名称")).toBeInTheDocument();
    expect(api.createDossier).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("新档案名称"), { target: { value: "南沙数据项目" } });
    fireEvent.click(screen.getByRole("button", { name: "创建档案" }));
    await waitFor(() => expect(api.createDossier).toHaveBeenCalledWith(expect.objectContaining({ name: "南沙数据项目", typeId: organization.id })));
  });

  it("preserves the draft on a revision conflict and exposes an explicit refresh action", async () => {
    const api = client({ updateDossier: vi.fn().mockRejectedValue(new CatalogUiError("conflict", "版本已变化")) });
    render(<CatalogFeature client={api} />);
    fireEvent.click(await screen.findByRole("button", { name: /广州数据交易所/ }));
    const name = await screen.findByLabelText("档案名称");
    fireEvent.change(name, { target: { value: "保留的草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "保存档案" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("档案已在其他位置更新");
    expect(name).toHaveValue("保留的草稿");
    fireEvent.click(screen.getByRole("button", { name: "刷新并比较" }));
    await waitFor(() => expect(api.getDossier).toHaveBeenCalledTimes(2));
  });

  it("clears the previous detail while a newly selected dossier is loading", async () => {
    const project = { ...dossier, id: "dos_01hzproject", name: "数据资产入表试点" };
    let resolveProject!: (value: CatalogDossier) => void;
    const pendingProject = new Promise<CatalogDossier>((resolve) => { resolveProject = resolve; });
    const api = client({
      search: vi.fn().mockResolvedValue({
        items: [
          { dossierId: dossier.id, name: dossier.name, typeId: organization.id, typeName: organization.name, tags: dossier.tags, documentCount: 12, revision: 3 },
          { dossierId: project.id, name: project.name, typeId: organization.id, typeName: organization.name, tags: [], documentCount: 2, revision: 1 },
        ],
        nextCursor: null,
        stale: false,
        degraded: false,
      }),
      getDossier: vi.fn((id: string) => id === project.id ? pendingProject : Promise.resolve(dossier)),
    });
    render(<CatalogFeature client={api} />);

    fireEvent.click(await screen.findByRole("button", { name: /广州数据交易所/ }));
    expect(await screen.findByRole("heading", { name: "广州数据交易所" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /数据资产入表试点/ }));

    expect(screen.queryByRole("heading", { name: "广州数据交易所" })).not.toBeInTheDocument();
    expect(screen.getByText("正在加载详情")).toBeInTheDocument();
    resolveProject(project);
    expect(await screen.findByRole("heading", { name: "数据资产入表试点" })).toBeInTheDocument();
  });

  it("shows degraded index state and rebuilds only on an explicit command", async () => {
    const api = client({
      search: vi.fn().mockResolvedValue({ items: [], nextCursor: null, stale: true, degraded: true }),
    });
    render(<CatalogFeature client={api} />);

    expect(await screen.findByText("目录索引需要重建")).toBeInTheDocument();
    expect(api.rebuildIndex).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "重建索引" }));
    await waitFor(() => expect(api.rebuildIndex).toHaveBeenCalledTimes(1));
  });
});
