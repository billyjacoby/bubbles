import type { ReactionType } from "@/lib/types";

export const REACTION_EMOJI: Record<ReactionType, string> = {
  love: "❤️",
  like: "👍",
  dislike: "👎",
  laugh: "😂",
  emphasize: "‼️",
  question: "❓",
};

export const REACTION_ORDER: ReactionType[] = [
  "love",
  "like",
  "dislike",
  "laugh",
  "emphasize",
  "question",
];

/** Message effect identifiers understood by the Private API helper. */
export const EFFECT_IDS = {
  slam: "com.apple.MobileSMS.expressivesend.impact",
  loud: "com.apple.MobileSMS.expressivesend.loud",
  gentle: "com.apple.MobileSMS.expressivesend.gentle",
  invisibleInk: "com.apple.MobileSMS.expressivesend.invisibleink",
  echo: "com.apple.messages.effect.CKEchoEffect",
  spotlight: "com.apple.messages.effect.CKSpotlightEffect",
  balloons: "com.apple.messages.effect.CKHappyBirthdayEffect",
  confetti: "com.apple.messages.effect.CKConfettiEffect",
  love: "com.apple.messages.effect.CKHeartEffect",
  lasers: "com.apple.messages.effect.CKLasersEffect",
  fireworks: "com.apple.messages.effect.CKFireworksEffect",
  celebration: "com.apple.messages.effect.CKSparklesEffect",
} as const;
