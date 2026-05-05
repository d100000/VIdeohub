function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.floor(Math.min(Math.max(number, min), max));
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function taskSourceLabel(source) {
  const labels = {
    chat: "对话",
    canvas: "画布",
    test: "测试任务",
  };
  return labels[source] || source || "画布";
}

export function parseTaskListFilters(req = {}) {
  const query = req.query || {};
  const createdTo = String(query.createdTo || "").trim();
  return {
    q: String(query.q || "").trim(),
    status: String(query.status || "").trim(),
    source: String(query.source || "").trim(),
    projectId: String(query.projectId || "").trim(),
    createdFrom: String(query.createdFrom || "").trim(),
    createdTo: /^\d{4}-\d{2}-\d{2}$/.test(createdTo) ? `${createdTo} 23:59:59` : createdTo,
    hasVideo: String(query.hasVideo || "").trim(),
    failedOnly: String(query.failedOnly || "").trim(),
    limit: boundedNumber(query.limit ?? 120, 120, 1, 500),
    offset: boundedNumber(query.offset ?? 0, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function taskListWhere(filters) {
  const where = ["generation_tasks.user_id = @userId"];
  const params = {
    limit: filters.limit,
    offset: filters.offset,
  };

  if (filters.q) {
    params.like = `%${filters.q}%`;
    where.push(`(
      generation_tasks.id LIKE @like OR
      generation_tasks.upstream_task_id LIKE @like OR
      generation_tasks.video_url LIKE @like OR
      generation_tasks.result_url LIKE @like OR
      projects.name LIKE @like
    )`);
  }
  if (filters.status) {
    params.status = filters.status;
    where.push("generation_tasks.status = @status");
  }
  if (filters.source) {
    params.source = filters.source;
    where.push("generation_tasks.source = @source");
  }
  if (filters.projectId) {
    params.projectId = filters.projectId;
    where.push("generation_tasks.project_id = @projectId");
  }
  if (filters.createdFrom) {
    params.createdFrom = filters.createdFrom;
    where.push("generation_tasks.created_at >= @createdFrom");
  }
  if (filters.createdTo) {
    params.createdTo = filters.createdTo;
    where.push("generation_tasks.created_at <= @createdTo");
  }
  if (filters.hasVideo === "1" || filters.hasVideo === "true") where.push("(generation_tasks.video_url IS NOT NULL AND generation_tasks.video_url != '')");
  if (filters.hasVideo === "0" || filters.hasVideo === "false") where.push("(generation_tasks.video_url IS NULL OR generation_tasks.video_url = '')");
  if (filters.failedOnly === "1" || filters.failedOnly === "true") where.push("generation_tasks.status = 'failed'");

  return { where: where.join(" AND "), params };
}

export function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function tasksToCsv(rows) {
  const header = [
    "task_id",
    "upstream_task_id",
    "project_name",
    "source",
    "status",
    "progress",
    "created_at",
    "updated_at",
    "completed_at",
    "video_url",
    "result_url",
    "error_message",
  ];
  const body = rows.map((row) => {
    const error = parseJson(row.error_json, null);
    return [
      row.id,
      row.upstream_task_id,
      row.project_name,
      row.source,
      row.status,
      row.progress,
      row.created_at,
      row.updated_at,
      row.completed_at,
      row.video_url,
      row.result_url,
      error?.message || "",
    ].map(csvCell).join(",");
  });
  return `${header.join(",")}\n${body.join("\n")}${body.length ? "\n" : ""}`;
}
