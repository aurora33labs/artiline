import { and, desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { addComment } from "@/app/actions/social";

export async function CommentsSection({
  artifactId,
  versionId,
  currentUserId,
  password,
  workspaceSlug,
  slug,
}: {
  artifactId: string;
  versionId?: string | null;
  currentUserId: string | null;
  password?: string;
  workspaceSlug?: string;
  slug?: string;
}) {
  const t = await getTranslations("comments");
  const tc = await getTranslations("common");

  const rows = await db
    .select({
      id: schema.comments.id,
      body: schema.comments.body,
      createdAt: schema.comments.createdAt,
      authorName: schema.comments.authorName,
      userName: schema.users.name,
      userEmail: schema.users.email,
    })
    .from(schema.comments)
    .leftJoin(schema.users, eq(schema.users.id, schema.comments.userId))
    .where(
      versionId
        ? and(
            eq(schema.comments.artifactId, artifactId),
            eq(schema.comments.versionId, versionId),
          )
        : eq(schema.comments.artifactId, artifactId),
    )
    .orderBy(desc(schema.comments.createdAt));

  return (
    <section className="space-y-4 pt-6 border-t">
      <h2 className="font-medium">{t("title", { count: rows.length })}</h2>
      <form action={addComment} className="space-y-3">
        <input type="hidden" name="artifactId" value={artifactId} />
        {versionId && (
          <input type="hidden" name="versionId" value={versionId} />
        )}
        {password && (
          <input type="hidden" name="password" value={password} />
        )}
        {workspaceSlug && (
          <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
        )}
        {slug && <input type="hidden" name="slug" value={slug} />}
        {!currentUserId && (
          <div className="space-y-1">
            <Label htmlFor="authorName">{t("yourName")}</Label>
            <Input id="authorName" name="authorName" maxLength={80} />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="body">{t("body")}</Label>
          <Textarea id="body" name="body" required rows={3} maxLength={2000} />
        </div>
        <Button type="submit" size="sm">
          {t("submit")}
        </Button>
      </form>

      <ul className="space-y-3">
        {rows.map((c) => (
          <li key={c.id} className="border rounded-md p-3 text-sm">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>
                {c.userName ?? c.userEmail ?? c.authorName ?? tc("anonymous")}
              </span>
              <span>{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
