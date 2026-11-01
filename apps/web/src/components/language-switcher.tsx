"use client";

import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { languageStorageKey } from "@/i18n/config";

export function LanguageSwitcher() {
	const { i18n, t } = useTranslation();

	const changeLanguage = (language: string) => {
		void i18n.changeLanguage(language);
		localStorage.setItem(languageStorageKey, language);
		document.documentElement.lang = language;
	};

	return (
		<label className="flex items-center gap-2 text-sm">
			<Languages className="size-4" aria-hidden="true" />
			<span className="sr-only">{t("language.label")}</span>
			<select
				aria-label={t("language.label")}
				className="h-8 cursor-pointer rounded-md border bg-background px-2"
				value={i18n.resolvedLanguage}
				onChange={(event) => changeLanguage(event.target.value)}
			>
				<option value="vi">{t("language.vi")}</option>
				<option value="en">{t("language.en")}</option>
			</select>
		</label>
	);
}
