// Result of the avatar upload and removal Server Actions, shared by the
// account and author administration forms.
export type AvatarFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
};
