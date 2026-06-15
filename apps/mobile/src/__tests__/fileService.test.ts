import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getOriginalFileDownloadState,
  type StoredFileReference,
} from "../fileService";

test("stored files with a backend id are eligible for original download", () => {
  const file: StoredFileReference = {
    fileId: "file-1",
    filename: "SAS.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    uploadStatus: "uploaded",
    sourceKind: "minio",
  };

  assert.deepEqual(getOriginalFileDownloadState(file), {
    available: true,
    label: "下载原文件",
  });
});

test("local files without a backend id explain that upload is pending", () => {
  assert.deepEqual(getOriginalFileDownloadState(null), {
    available: false,
    label: "文件尚未上传",
  });
});

test("destroyed files are not presented as pending backend integration", () => {
  const file: StoredFileReference = {
    fileId: "file-destroyed",
    filename: "旧协议.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    uploadStatus: "destroyed",
    sourceKind: "minio",
  };

  assert.deepEqual(getOriginalFileDownloadState(file), {
    available: false,
    label: "文件已销毁",
  });
});
