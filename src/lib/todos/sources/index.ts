import { channelSource } from "./channel";
import type { TodoSource } from "./types";

export type { SourceMessage, SourceContext, TodoSource } from "./types";

/**
 * Every source a scan reads. To add Microsoft Teams or email, implement TodoSource
 * (see the PR that added this file for what each needs) and list it here.
 */
export const TODO_SOURCE_REGISTRY: TodoSource[] = [channelSource];
