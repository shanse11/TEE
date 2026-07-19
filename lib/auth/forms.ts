import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "请输入邮箱。")
  .email("请输入有效的邮箱地址。");

export const passwordSchema = z
  .string()
  .min(8, "密码至少需要 8 位。")
  .regex(/[A-Za-z]/, "密码必须包含至少一个字母。")
  .regex(/[0-9]/, "密码必须包含至少一个数字。");

export const loginFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "请输入密码。"),
});

export const registerFormSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "请再次输入密码。"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "两次输入的密码不一致。",
    path: ["confirmPassword"],
  });

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
});

export const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "请再次输入密码。"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "两次输入的密码不一致。",
    path: ["confirmPassword"],
  });

export function firstValidationMessage(
  result: z.ZodSafeParseError<unknown>,
): string {
  return result.error.issues[0]?.message ?? "输入内容有误，请检查后重试。";
}
