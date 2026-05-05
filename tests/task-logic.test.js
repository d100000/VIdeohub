import assert from "node:assert/strict";
import test from "node:test";
import { taskRecoveryAdvice, taskSourceLabel, taskStatusLabel } from "../src/taskLogic.js";

test("task labels provide Chinese UI copy", () => {
  assert.equal(taskStatusLabel("queued"), "等待中");
  assert.equal(taskStatusLabel("in_progress"), "生成中");
  assert.equal(taskStatusLabel("completed"), "已完成");
  assert.equal(taskStatusLabel("unknown_status"), "unknown_status");
  assert.equal(taskStatusLabel(""), "未知");

  assert.equal(taskSourceLabel("chat"), "对话");
  assert.equal(taskSourceLabel("canvas"), "画布");
  assert.equal(taskSourceLabel("test"), "测试任务");
});

test("taskRecoveryAdvice sends API key failures to profile", () => {
  const advice = taskRecoveryAdvice({
    status: "failed",
    upstreamTaskId: "",
    error: { message: "401 unauthorized: invalid API key" },
  });

  assert.equal(advice.tone, "warning");
  assert.equal(advice.href, "/profile");
  assert.match(advice.body, /bobAPI/);
});

test("taskRecoveryAdvice distinguishes submit failures from recoverable upstream tasks", () => {
  const submitFailure = taskRecoveryAdvice({
    status: "failed",
    projectId: "project_1",
    resultNodeId: "render_1",
    upstreamTaskId: "",
    error: { message: "missing task id" },
  });
  assert.equal(submitFailure.tone, "error");
  assert.equal(submitFailure.href, "/app/projects/project_1?focus=render_1");

  const recoverable = taskRecoveryAdvice({
    id: "task_1",
    status: "failed",
    upstreamTaskId: "upstream_1",
    error: { message: "provider timeout" },
  });
  assert.equal(recoverable.refresh, true);
  assert.equal(recoverable.action, "重新拉取结果");
});
