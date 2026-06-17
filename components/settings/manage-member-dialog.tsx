"use client";

import { useState } from "react";
import { Loader2, Settings, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { changeMemberRole, removeMember } from "@/app/[workspace]/(nav)/settings/actions";

type AssignableRole = "member" | "admin";

export function ManageMemberDialog({
  workspaceSlug,
  member,
  canRemove,
  assignableRoles,
}: {
  workspaceSlug: string;
  member: { userId: string; name: string | null; email: string; role: string };
  canRemove: boolean;
  assignableRoles: AssignableRole[];
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const te = useTranslations("errors");

  const [open, setOpen] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(member.role);
  const [confirmEmail, setConfirmEmail] = useState("");

  const display = member.name ?? member.email;
  const canChangeRole = assignableRoles.length > 0;
  const roleChanged = selectedRole !== member.role;
  const emailMatches =
    confirmEmail.trim().toLowerCase() === member.email.toLowerCase();

  const toastError = (err: unknown) => {
    const code = (err as Error).message || "";
    toast.error(te.has(code) ? te(code) : te("generic"));
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        aria-label={t("manageBtn")}
        title={t("manageBtn")}
        onClick={() => setOpen(true)}
      >
        <Settings className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">{t("manageTitle")}</DialogTitle>
            <DialogDescription>
              {display} · {member.email}
            </DialogDescription>
          </DialogHeader>

          {canChangeRole && (
            <form
              className="space-y-2"
              action={async (fd) => {
                fd.set("workspaceSlug", workspaceSlug);
                fd.set("userId", member.userId);
                fd.set("role", selectedRole);
                setSavingRole(true);
                try {
                  await changeMemberRole(fd);
                  toast.success(t("roleUpdated"));
                  setOpen(false);
                } catch (err) {
                  toastError(err);
                } finally {
                  setSavingRole(false);
                }
              }}
            >
              <Label>{t("roleSectionLabel")}</Label>
              <div className="flex gap-2">
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="h-10 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.includes("member") && (
                      <SelectItem value="member">{t("memberRole")}</SelectItem>
                    )}
                    {assignableRoles.includes("admin") && (
                      <SelectItem value="admin">{t("adminRole")}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  type="submit"
                  className="h-10"
                  disabled={!roleChanged || savingRole}
                >
                  {savingRole ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t("saveRole")
                  )}
                </Button>
              </div>
            </form>
          )}

          {canRemove && (
            <form
              className="space-y-2 border-t border-border pt-4"
              action={async (fd) => {
                if (!emailMatches) return;
                fd.set("workspaceSlug", workspaceSlug);
                fd.set("userId", member.userId);
                fd.set("confirmEmail", confirmEmail);
                setDeleting(true);
                try {
                  await removeMember(fd);
                  setOpen(false);
                } catch (err) {
                  toastError(err);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              <div className="meta text-destructive">{t("dangerZone")}</div>
              <p className="text-sm text-muted-foreground">
                {t.rich("deleteAccountDesc", {
                  email: member.email,
                  b: (chunks) => (
                    <span className="font-medium text-foreground">{chunks}</span>
                  ),
                })}
              </p>
              <Input
                type="email"
                autoComplete="off"
                placeholder={t("confirmEmailPlaceholder")}
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                className="h-10"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={deleting}
                >
                  {tc("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={!emailMatches || deleting}
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {t("deleteAccountBtn")}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
