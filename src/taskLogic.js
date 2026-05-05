export function taskStatusLabel(status) {
  const map = {
    draft: "草稿",
    submitting: "提交中",
    submitted: "已提交",
    queued: "等待中",
    in_progress: "生成中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    expired: "已过期",
  };
  return map[status] || status || "未知";
}

export function taskSourceLabel(source) {
  const map = {
    chat: "对话",
    canvas: "画布",
    test: "测试任务",
  };
  return map[source] || source || "画布";
}

export function taskRecoveryAdvice(task) {
  const message = String(task?.error?.message || "").toLowerCase();
  const hasUpstreamTask = Boolean(task?.upstreamTaskId);
  if (/api[_\s-]?key|auth|unauthorized|401|403|bearer|权限|key/.test(message)) {
    return {
      tone: "warning",
      title: "API key 可能不可用",
      body: "先检查 bobAPI 分组是否包含 Seedance 模型，再替换 API key 后重新提交。",
      action: "去修改 API key",
      href: "/profile",
    };
  }
  if (!hasUpstreamTask) {
    return {
      tone: "error",
      title: "提交失败",
      body: "这个任务没有拿到上游 Task ID，无法直接拉取结果。建议回到源镜头修改参数后重新生成。",
      action: "打开关联画布",
      href: task?.projectId ? `/app/projects/${task.projectId}${task.resultNodeId ? `?focus=${task.resultNodeId}` : ""}` : "",
    };
  }
  if (task?.status === "failed") {
    return {
      tone: "info",
      title: "可以重新拉取",
      body: "这个任务已有上游 Task ID，本地失败不代表上游没有结果，可以继续刷新状态恢复视频 URL。",
      action: "重新拉取结果",
      refresh: true,
    };
  }
  return {
    tone: "info",
    title: "任务可追踪",
    body: "可以继续刷新上游状态，或打开完整 Task 查询页查看请求轨迹。",
    action: "打开 Task 查询",
    href: task?.id ? `/task-query?taskId=${encodeURIComponent(task.id)}` : "",
  };
}
