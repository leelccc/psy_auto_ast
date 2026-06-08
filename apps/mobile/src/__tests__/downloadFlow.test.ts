import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDownloadArtifact, sanitizeDownloadName } from "../downloadFlow";

test("generated consultation records download as named PDF files", () => {
  const artifact = buildDownloadArtifact({
    title: "陈雨 第6次咨询记录",
    fileType: "PDF",
    sections: [
      { title: "本次主题", content: "工作评价焦虑" },
      { title: "后续计划", content: "继续记录触发事件" },
    ],
  });

  assert.equal(artifact.filename, "陈雨_第6次咨询记录.pdf");
  assert.equal(artifact.mimeType, "application/pdf");
  assert.match(artifact.content, /本次主题/);
  assert.match(artifact.content, /继续记录触发事件/);
});

test("preview downloads preserve PDF and document extensions", () => {
  assert.equal(buildDownloadArtifact({ title: "咨询协议", fileType: "PDF", sections: [] }).filename, "咨询协议.pdf");
  assert.equal(buildDownloadArtifact({ title: "咨询记录", fileType: "Word", sections: [] }).filename, "咨询记录.doc");
});

test("download filenames remove filesystem punctuation", () => {
  assert.equal(sanitizeDownloadName("陈雨 / 第6次:咨询记录"), "陈雨_第6次_咨询记录");
});
