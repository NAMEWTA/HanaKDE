import React from "react";
import { createRoot } from "react-dom/client";

import { CatalogFeature, type CatalogClient, type CatalogDossier, type CatalogType } from "../../../src/ui/catalog/index.tsx";

const types: CatalogType[] = [
  {
    id: "typ_builtin_organization",
    key: "organization",
    name: "组织",
    builtin: true,
    fields: [
      { id: "fld_org_registration", key: "registration_number", label: "登记编号", type: "text", order: 0, required: false },
      { id: "fld_org_website", key: "website", label: "网站", type: "url", order: 1, required: false },
      { id: "fld_org_address", key: "address", label: "地址", type: "long_text", order: 2, required: false },
    ],
  },
  {
    id: "typ_builtin_project",
    key: "project",
    name: "项目",
    builtin: true,
    fields: [
      { id: "fld_project_status", key: "status", label: "状态", type: "enum", order: 0, required: false, options: ["planned", "active", "paused", "completed"] },
      { id: "fld_project_start", key: "start_date", label: "开始日期", type: "date", order: 1, required: false },
    ],
  },
];

const dossier: CatalogDossier = {
  id: "dos_01hzguangzhou",
  name: "广州数据交易所",
  typeId: types[0]!.id,
  type: types[0]!,
  fields: {
    fld_org_registration: "91440101MA9Y2026X",
    fld_org_website: "https://example.com",
    fld_org_address: "广州市南沙区横沥镇明珠一街",
    fld_legacy_source: "2026 年迁移保留值",
  },
  tags: ["数据要素", "机构", "广州"],
  contacts: [
    { contactId: "con_01hzzhangsan", role: "业务联系人", contact: { id: "con_01hzzhangsan", name: "张三", title: "业务经理", organization: "广州数据交易所" } },
    { contactId: "con_01hzlisi0000", role: "合规联系人", contact: { id: "con_01hzlisi0000", name: "李四", title: "合规负责人" } },
  ],
  documentCount: 28,
  revision: 7,
};

const items = [
  { dossierId: dossier.id, name: dossier.name, typeId: dossier.typeId, typeName: "组织", tags: dossier.tags, documentCount: 28, revision: 7 },
  { dossierId: "dos_01hzprojecta", name: "数据资产入表试点", typeId: types[1]!.id, typeName: "项目", tags: ["进行中", "财务"], documentCount: 16, revision: 4 },
  { dossierId: "dos_01hzcompanya", name: "粤港澳数据服务有限公司", typeId: types[0]!.id, typeName: "组织", tags: ["合作方"], documentCount: 9, revision: 2 },
];

const client: CatalogClient = {
  async listTypes() { return { items: types }; },
  async search(input) { return { items: items.filter((item) => !input.query || JSON.stringify(item).includes(input.query)), nextCursor: null, stale: false, degraded: false }; },
  async getDossier(id) { return id === dossier.id ? dossier : { ...dossier, id, name: items.find((item) => item.dossierId === id)?.name ?? "项目档案", contacts: [], documentCount: 4 }; },
  async createDossier(input) { return { ...dossier, id: "dos_01hzcreated0", name: input.name, typeId: input.typeId, type: types.find((type) => type.id === input.typeId) ?? types[0]!, fields: input.fields, tags: input.tags, contacts: [], documentCount: 0, revision: 1 }; },
  async updateDossier(_id, _revision, patch) { return { ...dossier, ...patch, revision: dossier.revision + 1 }; },
  async rebuildIndex() { return { status: "ready" }; },
};

const root = document.getElementById("root");
if (!root) throw new Error("Catalog harness root is missing");
createRoot(root).render(<CatalogFeature client={client} />);
