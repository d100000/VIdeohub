import assert from "node:assert/strict";
import test from "node:test";
import { buildFrameCaptureAttempts, missingFrameAssets } from "../lib/frame-extraction-utils.js";
import {
  csvCell,
  parseTaskListFilters,
  taskListWhere,
  taskSourceLabel,
  tasksToCsv,
} from "../lib/task-center-utils.js";

test("parseTaskListFilters clamps unsafe pagination values", () => {
  assert.deepEqual(parseTaskListFilters({ query: { limit: "nope", offset: "-8" } }), {
    q: "",
    status: "",
    source: "",
    projectId: "",
    createdFrom: "",
    createdTo: "",
    hasVideo: "",
    failedOnly: "",
    limit: 120,
    offset: 0,
  });

  const filters = parseTaskListFilters({ query: { limit: "999", offset: "12.8", createdTo: "2026-05-05" } });
  assert.equal(filters.limit, 500);
  assert.equal(filters.offset, 12);
  assert.equal(filters.createdTo, "2026-05-05 23:59:59");
});

test("taskListWhere only includes active filters and bound params", () => {
  const filters = parseTaskListFilters({
    query: {
      q: "task_123",
      status: "failed",
      source: "canvas",
      projectId: "project_1",
      hasVideo: "false",
      failedOnly: "true",
    },
  });
  const { where, params } = taskListWhere(filters);

  assert.match(where, /generation_tasks\.user_id = @userId/);
  assert.match(where, /generation_tasks\.id LIKE @like/);
  assert.match(where, /generation_tasks\.status = @status/);
  assert.match(where, /generation_tasks\.source = @source/);
  assert.match(where, /generation_tasks\.project_id = @projectId/);
  assert.match(where, /video_url IS NULL/);
  assert.match(where, /generation_tasks\.status = 'failed'/);
  assert.equal(params.like, "%task_123%");
  assert.equal(params.status, "failed");
  assert.equal(params.source, "canvas");
  assert.equal(params.projectId, "project_1");
});

test("tasksToCsv escapes commas, quotes, and error text", () => {
  assert.equal(csvCell('a,b "quoted"'), '"a,b ""quoted"""');

  const csv = tasksToCsv([
    {
      id: "task_1",
      upstream_task_id: "up_1",
      project_name: "项目, A",
      source: "chat",
      status: "failed",
      progress: 42,
      created_at: "2026-05-05",
      updated_at: "2026-05-05",
      completed_at: "",
      video_url: "",
      result_url: "",
      error_json: JSON.stringify({ message: 'bad "request"' }),
    },
  ]);

  assert.match(csv, /^task_id,upstream_task_id,/);
  assert.match(csv, /"项目, A"/);
  assert.match(csv, /"bad ""request"""/);
});

test("taskSourceLabel covers known and custom sources", () => {
  assert.equal(taskSourceLabel("chat"), "对话");
  assert.equal(taskSourceLabel("canvas"), "画布");
  assert.equal(taskSourceLabel("test"), "测试任务");
  assert.equal(taskSourceLabel("external"), "external");
  assert.equal(taskSourceLabel(""), "画布");
});

test("missingFrameAssets only requests the frames that are still absent", () => {
  assert.deepEqual(missingFrameAssets({}), {
    needFirstFrame: true,
    needLastFrame: true,
  });

  assert.deepEqual(missingFrameAssets({ last_frame_asset_id: "asset_last" }), {
    needFirstFrame: true,
    needLastFrame: false,
  });

  assert.deepEqual(missingFrameAssets({ firstFrameAssetId: "asset_first", lastFrameAssetId: "asset_last" }), {
    needFirstFrame: false,
    needLastFrame: false,
  });
});

test("buildFrameCaptureAttempts configures robust ffmpeg single-image output", () => {
  const firstAttempts = buildFrameCaptureAttempts({
    frame: "first",
    inputPath: "/tmp/input.mp4",
    outputPath: "/tmp/first.jpg",
  });
  assert.equal(firstAttempts[0].label, "decode_first_frame");
  assert.deepEqual(firstAttempts[0].args.slice(-6), ["-frames:v", "1", "-update", "1", "-q:v", "2", "/tmp/first.jpg"].slice(-6));
  assert.match(firstAttempts[0].args.join(" "), /select=eq\(n\\,0\)/);

  const lastAttempts = buildFrameCaptureAttempts({
    frame: "last",
    inputPath: "/tmp/input.mp4",
    outputPath: "/tmp/last.jpg",
  });
  assert.equal(lastAttempts[0].label, "seek_from_end");
  assert.match(lastAttempts[0].args.join(" "), /-sseof -0\.1/);
});
