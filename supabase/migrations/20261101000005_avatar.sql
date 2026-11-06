-- Profile picture: path of the user's image in the private 'private-files' bucket (always under '<user_id>/avatar/').
alter table profiles add column if not exists avatar_path text;
alter table profiles drop constraint if exists profiles_avatar_path_check;
alter table profiles add constraint profiles_avatar_path_check check (avatar_path is null or avatar_path like id::text || '/avatar/%');
