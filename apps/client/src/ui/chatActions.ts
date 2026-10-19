import { setMuted, type ChatChannel } from '../game/chat';
import { pushToast, uiStore } from './store';

let channel: ChatChannel | null = null;

export function setChannel(c: ChatChannel | null): void {
  channel = c;
}

export const chatActions = {
  async send(body: string): Promise<boolean> {
    if (!channel) return false;
    const error = await channel.send(body);
    if (error) pushToast('error', 'chat.error');
    return !error;
  },
  async report(messageId: number): Promise<void> {
    if (channel && (await channel.report(messageId))) pushToast('info', 'chat.reported');
  },
  mute(userId: string, muted: boolean): void {
    setMuted(userId, muted);
    // Re-render the chat with the new filter.
    uiStore.setState((s) => ({ chat: [...s.chat] }));
  },
  open(open: boolean): void {
    uiStore.setState(open ? { chatOpen: true, chatUnread: 0 } : { chatOpen: false });
  },
};
