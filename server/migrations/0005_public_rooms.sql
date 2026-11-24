CREATE TABLE public_rooms (code TEXT PRIMARY KEY, host_name TEXT NOT NULL, humans INTEGER NOT NULL, config TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX public_rooms_updated_at ON public_rooms(updated_at);
