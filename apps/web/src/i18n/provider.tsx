"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";

import { defaultLanguage, i18n, languageStorageKey } from "./config";

export function I18nProvider({ children }: { children: ReactNode }) {
	useEffect(() => {
		const savedLanguage = localStorage.getItem(languageStorageKey);
		const language = savedLanguage === "en" ? "en" : defaultLanguage;
		void i18n.changeLanguage(language);
		document.documentElement.lang = language;
	}, []);

	return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
