import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildNewProfile,
  displayProfileCode,
  filterProfiles,
  normalizeProfileCodeInput,
  profileKindToLabel,
  suggestedProfileCode,
  type ProfileListItem,
} from "../profileLibrary";

const profiles: ProfileListItem[] = [
  { id: "chen-yu", displayCode: "A08", name: "陈雨", type: "来访者", count: "第6次", status: "进行中", risk: "轻度", next: "6月8日 10:00" },
  { id: "li-cheng", name: "李澄", type: "督导师", count: "第3次", status: "线上", risk: "无", next: "6月9日 15:30" },
  { id: "zhou-ning", name: "周宁", type: "受督者", count: "第12次", status: "线下", risk: "无", next: "6月12日 14:00" },
];

test("filterProfiles applies identity filter and text query together", () => {
  assert.deepEqual(filterProfiles(profiles, "supervisor", "李"), [profiles[1]]);
  assert.deepEqual(filterProfiles(profiles, "client", "李"), []);
  assert.deepEqual(filterProfiles(profiles, "all", "zhou"), [profiles[2]]);
  assert.deepEqual(filterProfiles(profiles, "all", "a08"), [profiles[0]]);
});

test("buildNewProfile creates an empty profile without inventing a first session", () => {
  assert.deepEqual(
    buildNewProfile({
      kind: "supervisee",
      name: "林清",
      next: "",
    }),
    {
      id: "supervisee-林清",
      name: "林清",
      type: "受督者",
      count: "尚无记录",
      status: "新建",
      risk: "未评估",
      next: "未设置",
    },
  );
});

test("profileKindToLabel maps creation identity to archive identity labels", () => {
  assert.equal(profileKindToLabel("client"), "来访者");
  assert.equal(profileKindToLabel("supervisor"), "督导师");
  assert.equal(profileKindToLabel("supervisee"), "受督者");
});

test("suggestedProfileCode creates a short readable sequence per profile kind and year", () => {
  assert.equal(
    suggestedProfileCode([
      ...profiles,
      { id: "recent", displayCode: "C26-001", name: "许明", type: "来访者", count: "尚无记录", status: "新建", risk: "未评估", next: "未设置" },
    ], "client", new Date("2026-06-23T10:00:00+08:00")),
    "C26-002",
  );
  assert.equal(suggestedProfileCode(profiles, "supervisor", new Date("2026-06-23T10:00:00+08:00")), "S26-001");
});

test("profile code display never falls back to the long internal id", () => {
  assert.equal(displayProfileCode(profiles[0]), "A08");
  assert.equal(displayProfileCode(profiles[1]), "未编号");
});

test("normalizeProfileCodeInput keeps manual codes short and portable", () => {
  assert.equal(normalizeProfileCodeInput(" c26-001 "), "C26-001");
  assert.equal(normalizeProfileCodeInput("来访者-000000000000"), "000000000000");
  assert.equal(normalizeProfileCodeInput("abc_def_123456789"), "ABC_DEF_1234");
});
