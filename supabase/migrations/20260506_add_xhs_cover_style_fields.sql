-- 小红书封面：记录 AI 自动选择的视觉风格

alter table public.xhs_drafts
  add column if not exists cover_style_id text;

alter table public.xhs_drafts
  add column if not exists cover_style_label text;

alter table public.xhs_drafts
  add column if not exists cover_style_reason text;
