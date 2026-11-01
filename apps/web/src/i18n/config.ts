import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import { resources } from "./resources.ts";

export const defaultLanguage = "vi";
export const languageStorageKey = "expense-tracker-language";

const options = {
	resources,
	lng: defaultLanguage,
	fallbackLng: defaultLanguage,
	interpolation: { escapeValue: false },
} as const;

export const i18n = createInstance().use(initReactI18next);
void i18n.init({ ...options, initAsync: false });

export async function createI18n(language = defaultLanguage) {
	const instance = createInstance();
	await instance.use(initReactI18next).init({ ...options, lng: language });
	return instance;
}
