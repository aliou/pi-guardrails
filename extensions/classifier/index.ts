import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configLoader } from "../../src/shared/config";
import { registerDelegate } from "../../src/shared/delegation";
import {
  createFeatureRegisterPayload,
  GUARDRAILS_FEATURE_REGISTER_EVENT,
  GUARDRAILS_FEATURE_REQUEST_EVENT,
} from "../../src/shared/events";
import { runClassifier } from "./classify";

export const CLASSIFIER_DELEGATE_ID = "guardrails:classifier";

export default async function classifier(pi: ExtensionAPI) {
  await configLoader.load();

  pi.events.on(GUARDRAILS_FEATURE_REQUEST_EVENT, () => {
    pi.events.emit(
      GUARDRAILS_FEATURE_REGISTER_EVENT,
      createFeatureRegisterPayload("classifier"),
    );
  });

  const unregister = registerDelegate(pi, {
    id: CLASSIFIER_DELEGATE_ID,
    name: "classifier",
    isEnabled: () => {
      const config = configLoader.getConfig();
      return config.enabled && config.features.classifier;
    },
    decide: async (request, context) => {
      const config = configLoader.getConfig();
      return runClassifier(request, context, {
        models: config.classifier.models,
        strategy: config.classifier.strategy,
      });
    },
  });
  pi.on("session_shutdown", unregister);
}
