export {
  type CommandCallback,
  isFdDuplicationRedirect,
  isHeredocRedirect,
  walkCommands,
  wordHasExpansion,
  wordToString,
} from "./ast";
export { type ClassifiedArg, classifyCommandArgs } from "./command-args";
export { stripBashComments } from "./comments";
