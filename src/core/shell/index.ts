export {
  type CommandCallback,
  isFdDuplicationRedirect,
  isHeredocRedirect,
  walkCommands,
  wordHasExpansion,
  wordToString,
} from "./ast";
export {
  type ClassifiedArg,
  classifyCommandArgs,
  takesNoFileOperands,
} from "./command-args";
