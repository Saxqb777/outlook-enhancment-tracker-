-- Files sent in a chat: the case chat, or the chat with one vendor on a request.
create table chat_files (
  id              bigint generated always as identity primary key,
  case_message_id bigint references case_messages (id) on delete cascade,
  rfq_message_id  bigint references rfq_messages (id) on delete cascade,
  name            text not null,
  mime            text not null,
  size            int not null,
  storage         text not null check (storage in ('blob', 'local')),
  url             text not null,
  pathname        text not null,
  created_at      timestamptz not null default now(),
  check ((case_message_id is null) <> (rfq_message_id is null))
);
create index chat_files_case_idx on chat_files (case_message_id);
create index chat_files_rfq_idx on chat_files (rfq_message_id);
