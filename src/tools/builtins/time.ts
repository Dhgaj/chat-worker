// 时间获取

import { Tool } from "../types";

// 时间工具定义和实现
export const timeTool: Tool = {
  name: "get_current_time",
  description: "获取当前时间。当用户询问现在几点、当前时间、日期等时间相关问题时使用此工具。",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "时区，默认为 Asia/Shanghai（北京时间）",
      },
      format: {
        type: "string",
        description: "时间格式: 'full' (完整日期时间), 'time' (仅时间), 'date' (仅日期)",
        enum: ["full", "time", "date"],
      },
    },
    required: [],
  },
  execute: async (args) => {
    const timezone = args.timezone || "Asia/Shanghai";
    const format = args.format || "full";
    
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour12: false,
    };
    
    if (format === "time") {
      options.hour = "2-digit";
      options.minute = "2-digit";
      options.second = "2-digit";
    } else if (format === "date") {
      options.year = "numeric";
      options.month = "2-digit";
      options.day = "2-digit";
      options.weekday = "long";
    } else {
      // full
      options.year = "numeric";
      options.month = "2-digit";
      options.day = "2-digit";
      options.weekday = "long";
      options.hour = "2-digit";
      options.minute = "2-digit";
      options.second = "2-digit";
    }
    
    return now.toLocaleString("zh-CN", options);
  },
};
