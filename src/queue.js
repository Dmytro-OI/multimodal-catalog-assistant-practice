import { config } from './config.js';
import { supabase } from './clients/supabase.js';
import { handleUpdate } from './webhooks/telegram.js';
import { telegramWebhook } from './http.js';

export async function startQueue(app) {
  const probe = await supabase.from('assistant_updates').select('update_id').limit(0);
  if (probe.error) throw new Error('Assistant inbox migration is required');
  const claimProbe = await supabase.rpc('claim_assistant_update', { probe_only: true });
  if (claimProbe.error) throw new Error('Assistant claim function is required');

  app.use(telegramWebhook({
    secret: config.telegram.webhookSecret,
    enqueue: async (update) => {
      const { error } = await supabase.from('assistant_updates').insert({
        update_id: update.update_id, payload: update,
      });
      if (error && error.code !== '23505') throw new Error('Inbox unavailable');
    },
  }));

  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const { data, error } = await supabase.rpc('claim_assistant_update', { probe_only: false });
      if (error) throw error;
      const job = data?.[0];
      if (!job) return;
      try {
        await handleUpdate(job.payload, { attempt: job.attempts });
        const result = await supabase.from('assistant_updates').update({
          status: 'done', payload: {}, lease_until: null,
        }).eq('update_id', job.update_id).eq('attempts', job.attempts);
        if (result.error) throw result.error;
      } catch (processingError) {
        const status = Number(processingError?.status || processingError?.code || 0);
        const retryable = !status || [408, 429, 500, 502, 503, 504].includes(status);
        const result = await supabase.from('assistant_updates').update({
          status: !retryable || job.attempts >= 5 ? 'failed' : 'pending',
          available_at: new Date(Date.now() + Math.min(300000, 5000 * 2 ** job.attempts)).toISOString(),
          lease_until: null,
        }).eq('update_id', job.update_id).eq('attempts', job.attempts);
        if (result.error) console.error('Assistant inbox update failed');
        console.error('Assistant update failed', {
          updateId: job.update_id,
          status: status || null,
          retryable,
          message: String(processingError?.message || 'Unknown processing error').slice(0, 500),
        });
      }
    } catch (workerError) {
      console.error('Assistant worker temporarily unavailable', {
        message: String(workerError?.message || 'Unknown worker error').slice(0, 500),
      });
    } finally {
      busy = false;
    }
  }, 2000);
  timer.unref();
  return () => clearInterval(timer);
}
