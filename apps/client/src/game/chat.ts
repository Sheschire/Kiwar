import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface ChatMessage {
  id: number;
  universe_id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
}

/** Chantier 56: a feat of the league as it fell (written by the server only). */
export interface FeatLine {
  id: number;
  user_id: string;
  feat: string;
  points: number;
  at: string;
}

/** Chantier 57: a battle between two players as it ended (written by the server only). */
export interface BattleLine {
  id: string;
  attacker_name: string;
  defender_name: string;
  outcome: 'held' | 'looted' | 'turnedBack';
  loot: number;
  at: string;
}

const HISTORY = 60;
/** Feats shown in the chat: the latest ones of the seasons (the record stays in the League). */
const FEAT_HISTORY = 20;
const POLL_MS = 20_000;
const MUTED_KEY = 'kiwar.muted';

export function mutedUsers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MUTED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function setMuted(userId: string, muted: boolean): string[] {
  const list = new Set(mutedUsers());
  if (muted) list.add(userId);
  else list.delete(userId);
  const out = [...list];
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify(out));
  } catch {
    // ignore
  }
  return out;
}

const READ_KEY = 'kiwar.chatRead';

/** Id of the last message read in a universe's chat (0: none), kept across reloads. */
export function lastReadId(universeId: string): number {
  try {
    const all = JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, number>;
    return all[universeId] ?? 0;
  } catch {
    return 0;
  }
}

export function markRead(universeId: string, messageId: number): void {
  if (messageId <= lastReadId(universeId)) return;
  try {
    const all = JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, number>;
    all[universeId] = messageId;
    localStorage.setItem(READ_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/**
 * Team chat of a universe: reads/writes `chat_messages` directly (RLS checks membership) and
 * listens to new messages with Supabase Realtime, with a slow polling fallback.
 */
export class ChatChannel {
  private channel: RealtimeChannel | null = null;
  private poll: number | undefined;
  private messages: ChatMessage[] = [];
  private feats: FeatLine[] = [];
  private battles: BattleLine[] = [];

  constructor(
    private readonly client: SupabaseClient,
    private readonly universeId: string,
    private readonly onChange: (messages: ChatMessage[], fresh: ChatMessage[]) => void,
    private readonly onFeats: (feats: FeatLine[]) => void = () => {},
    private readonly onBattles: (battles: BattleLine[]) => void = () => {},
  ) {}

  async start(): Promise<void> {
    await this.refresh();
    this.channel = this.client
      .channel(`chat:${this.universeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `universe_id=eq.${this.universeId}`,
        },
        (payload) => this.merge([payload.new as ChatMessage]),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'league_feats',
          filter: `universe_id=eq.${this.universeId}`,
        },
        (payload) => {
          const f = payload.new as FeatLine & { season: number };
          if (f.season >= 1) this.mergeFeats([f]);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pvp_battles',
          filter: `universe_id=eq.${this.universeId}`,
        },
        (payload) => this.mergeBattles([payload.new as BattleLine]),
      )
      .subscribe();
    this.poll = window.setInterval(() => void this.refresh(), POLL_MS);
  }

  private async refresh(): Promise<void> {
    const { data, error } = await this.client
      .from('chat_messages')
      .select('id, universe_id, user_id, display_name, body, created_at')
      .eq('universe_id', this.universeId)
      .order('id', { ascending: false })
      .limit(HISTORY);
    if (!error && data) this.merge(data as ChatMessage[]);
    // Chantier 56: the feats of the seasons (season 0, the past, stays out of the chat).
    const feats = await this.client
      .from('league_feats')
      .select('id, user_id, feat, points, at')
      .eq('universe_id', this.universeId)
      .gte('season', 1)
      .order('at', { ascending: false })
      .limit(FEAT_HISTORY);
    if (!feats.error && feats.data) this.mergeFeats(feats.data as FeatLine[]);
    // Chantier 57: the battles between players (a missing table reads as an error: nothing).
    const battles = await this.client
      .from('pvp_battles')
      .select('id, attacker_name, defender_name, outcome, loot, at')
      .eq('universe_id', this.universeId)
      .order('at', { ascending: false })
      .limit(FEAT_HISTORY);
    if (!battles.error && battles.data) this.mergeBattles(battles.data as BattleLine[]);
  }

  private mergeBattles(incoming: BattleLine[]): void {
    const known = new Set(this.battles.map((b) => b.id));
    const fresh = incoming.filter((b) => !known.has(b.id));
    if (fresh.length === 0) return;
    this.battles = [...this.battles, ...fresh]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .slice(-FEAT_HISTORY);
    this.onBattles(this.battles);
  }

  private mergeFeats(incoming: FeatLine[]): void {
    const known = new Set(this.feats.map((f) => f.id));
    const fresh = incoming.filter((f) => !known.has(f.id));
    if (fresh.length === 0) return;
    this.feats = [...this.feats, ...fresh]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .slice(-FEAT_HISTORY);
    this.onFeats(this.feats);
  }

  private merge(incoming: ChatMessage[]): void {
    const known = new Set(this.messages.map((m) => m.id));
    const fresh = incoming.filter((m) => !known.has(m.id));
    if (fresh.length === 0) return;
    this.messages = [...this.messages, ...fresh].sort((a, b) => a.id - b.id).slice(-HISTORY);
    this.onChange(this.messages, fresh);
  }

  async send(body: string): Promise<string | null> {
    const text = body.trim().slice(0, 280);
    if (!text) return null;
    const { data, error } = await this.client
      .from('chat_messages')
      .insert({ universe_id: this.universeId, body: text })
      .select('id, universe_id, user_id, display_name, body, created_at')
      .single();
    if (error) return error.message;
    if (data) this.merge([data as ChatMessage]);
    return null;
  }

  async report(messageId: number): Promise<boolean> {
    const { error } = await this.client
      .from('chat_reports')
      .insert({ message_id: messageId, reason: 'player report' });
    return !error || error.code === '23505';
  }

  stop(): void {
    window.clearInterval(this.poll);
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
  }
}
