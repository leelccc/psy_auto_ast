import assert from "node:assert/strict";
import { test } from "node:test";

import { buildNewProfile, filterProfiles, profileKindToLabel, type ProfileListItem } from "../profileLibrary";

const profiles: ProfileListItem[] = [
  { id: "chen-yu", name: "陈雨", type: "来访者", count: "第6次", status: "进行中", risk: "轻度", next: "6月8日 10:00" },
  { id: "li-cheng", name: "李澄", type: "督导师", count: "第3次", status: "线上", risk: "无", next: "6月9日 15:30" },
  { id: "zhou-ning", name: "周宁", type: "受督者", count: "第12次", status: "线下", risk: "无", next: "6月12日 14:00" },
];

test("filterProfiles applies identity filter and text query together", () => {
  assert.deepEqual(filterProfiles(profiles, "supervisor", "李"), [profiles[1]]);
  assert.deepEqual(filterProfiles(profiles, "client", "李"), []);
  assert.deepEqual(filterProfiles(profiles, "all", "zhou"), [profiles[2]]);
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
