/**
 * BullMQ reserves ':' as its Redis key separator and rejects a custom job id
 * that contains one ("Custom Id cannot contain :"). Notification dedupe keys
 * are colon-separated, so the BullMQ job id is a sanitised form of the key.
 *
 * Pure string helper, kept in its own module (no BullMQ import) so it can be
 * unit-tested without constructing a Queue.
 */
export function toJobId(dedupeKey: string): string {
  return dedupeKey.replace(/[^A-Za-z0-9_-]/g, '_');
}
