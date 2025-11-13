import { ZodError, type ZodSchema } from "zod";

export const parsePayload = <T>(schema: ZodSchema<T>, input: unknown): T => {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      const message =
        error.issues
          .map((issue) => issue.message)
          .filter(Boolean)
          .join("; ") || "请求参数不合法";
      throw new Error(message);
    }
    throw error;
  }
};

