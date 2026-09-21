import assert from "node:assert/strict";
import test from "node:test";

import { createI18n } from "./config.ts";

test("defaults to Vietnamese and can switch to English", async () => {
	const i18n = await createI18n();

	assert.equal(i18n.resolvedLanguage, "vi");
	assert.equal(i18n.t("language.label"), "Ngôn ngữ");

	await i18n.changeLanguage("en");

	assert.equal(i18n.resolvedLanguage, "en");
	assert.equal(i18n.t("language.label"), "Language");
});
