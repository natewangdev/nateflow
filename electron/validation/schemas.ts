import { z } from "zod";

const nonEmptyString = (message: string) => z.string().trim().min(1, message);

export const projectIdSchema = nonEmptyString("缺少项目标识");

export const projectCreateSchema = z.object({
  name: nonEmptyString("项目名称为必填项"),
  imageBase64: z.string().trim().optional()
});

export const projectUpdateSchema = projectCreateSchema.extend({
  id: nonEmptyString("缺少项目标识")
});

const actionContentSchema = z.union([z.record(z.unknown()), z.string()]);

const actionBaseSchema = z.object({
  name: nonEmptyString("Action 名称不能为空"),
  templateId: nonEmptyString("缺少模板标识"),
  templateName: z.string().trim().default(""),
  content: actionContentSchema
});

export const actionCreateSchema = actionBaseSchema.extend({
  projectId: projectIdSchema
});

export const actionUpdateSchema = actionBaseSchema.extend({
  id: nonEmptyString("缺少 Action 标识"),
  projectId: projectIdSchema
});

export const actionDeleteSchema = z.object({
  projectId: projectIdSchema,
  id: nonEmptyString("缺少 Action 标识")
});

export const actionDeleteManySchema = z.object({
  projectId: projectIdSchema,
  ids: z.array(nonEmptyString("缺少 Action 标识")).min(1, "请至少选择一个 Action")
});

const taskBaseSchema = z.object({
  name: nonEmptyString("Task 名称不能为空"),
  actionIds: z.array(nonEmptyString("缺少 Action 标识")).default([])
});

export const taskCreateSchema = taskBaseSchema.extend({
  projectId: projectIdSchema
});

export const taskUpdateSchema = taskBaseSchema.extend({
  id: nonEmptyString("缺少 Task 标识"),
  projectId: projectIdSchema
});

export const taskDeleteSchema = z.object({
  projectId: projectIdSchema,
  id: nonEmptyString("缺少 Task 标识")
});

export const taskDeleteManySchema = z.object({
  projectId: projectIdSchema,
  ids: z.array(nonEmptyString("缺少 Task 标识")).min(1, "请至少选择一个 Task")
});

const planTaskRefSchema = z.object({
  id: nonEmptyString("缺少 Task 标识"),
  repeat: z.tuple([z.number(), z.number()]).optional()
});

const planBaseSchema = z.object({
  name: nonEmptyString("Plan 名称不能为空"),
  tasks: z.array(planTaskRefSchema).min(1, "Plan 至少需要一个 Task")
});

export const planCreateSchema = planBaseSchema.extend({
  projectId: projectIdSchema
});

export const planUpdateSchema = planBaseSchema.extend({
  id: nonEmptyString("缺少 Plan 标识"),
  projectId: projectIdSchema
});

export const planDeleteSchema = z.object({
  projectId: projectIdSchema,
  id: nonEmptyString("缺少 Plan 标识")
});

export const planDeleteManySchema = z.object({
  projectId: projectIdSchema,
  ids: z.array(nonEmptyString("缺少 Plan 标识")).min(1, "请至少选择一个 Plan")
});

export const templatePayloadSchema = z.object({
  name: nonEmptyString("模板名称为必填项"),
  description: z.string().optional(),
  content: z.union([z.record(z.unknown()), z.string()])
});

export const templateUpdateSchema = templatePayloadSchema.extend({
  id: nonEmptyString("缺少模板标识")
});

export const templateIdSchema = nonEmptyString("缺少模板标识");

export const settingsUpdateSchema = z.object({
  theme: z.enum(["light", "dark"]).optional(),
  projectRoot: z.string().trim().optional()
});

