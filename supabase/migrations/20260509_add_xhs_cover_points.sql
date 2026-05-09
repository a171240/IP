-- 小红书封面：保存首图短信息点，方便草稿恢复后继续生成更充实的封面

alter table public.xhs_drafts
  add column if not exists cover_points jsonb not null default '[]'::jsonb;
