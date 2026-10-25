"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/features/auth/components/form-alert";
import type { SiteSettingsFormState } from "@/features/site-settings/actions";
import { accentPalette, normalizeAccentColor, type ThemeAccent } from "@/features/site-settings/color";
import {
  socialProviderNames,
  socialProviders,
} from "@/features/site-settings/social";
import {
  siteSettingsLimits,
  type SiteSettingsField,
  type SiteSettingsFormValues,
} from "@/features/site-settings/validation";
import {
  interfaceLocaleNames,
  interfaceLocales,
  type InterfaceLocale,
} from "@/lib/interface-locales";
import { BrandMediaField, type BrandMediaOption } from "./brand-media-field";

type SiteSettingsFormProps = {
  action: (state: SiteSettingsFormState, formData: FormData) => Promise<SiteSettingsFormState>;
  revision: number;
  initialValues: SiteSettingsFormValues;
  media: BrandMediaOption[];
  mediaError: boolean;
};

const fallbackPickerColor = "#737373";

// One form for every section; one save, one revision check. Text fields are
// uncontrolled and remount with the submitted values after an error. Images,
// the accent color, and the locales are controlled because the form reacts to
// them: previews, the live accent preview, and the default-locale choices.
export function SiteSettingsForm(props: SiteSettingsFormProps) {
  const [state, formAction, pending] = useActionState(props.action, {
    status: "idle",
    message: null,
    fieldErrors: {},
  } satisfies SiteSettingsFormState);

  return (
    <SiteSettingsFields
      // Remount after each failed submit so the kept values become defaults.
      key={JSON.stringify(state.values ?? null)}
      {...props}
      state={state}
      formAction={formAction}
      pending={pending}
    />
  );
}

function SiteSettingsFields({
  revision,
  initialValues,
  media,
  mediaError,
  state,
  formAction,
  pending,
}: SiteSettingsFormProps & {
  state: SiteSettingsFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const t = useTranslations("adminSettings");
  const tForm = useTranslations("admin.form");
  const values = state.values ?? initialValues;

  const [library, setLibrary] = useState(media);
  const [images, setImages] = useState({
    logoLight: values.logoLight,
    logoDark: values.logoDark,
    icon: values.icon,
    ogImage: values.ogImage,
  });
  const [accent, setAccent] = useState(values.accentColor);
  const [enabled, setEnabled] = useState<string[]>(values.enabledLocales);
  const [defaultLocale, setDefaultLocale] = useState(values.defaultLocale);

  const fieldId = (field: SiteSettingsField) => `site-settings-${field.replace(".", "-")}`;
  const errorId = (field: SiteSettingsField) => `${fieldId(field)}-error`;
  const hintId = (field: SiteSettingsField) => `${fieldId(field)}-hint`;
  const error = (field: SiteSettingsField) => state.fieldErrors[field];

  const describe = (field: SiteSettingsField, hint = true) =>
    [hint ? hintId(field) : null, error(field) ? errorId(field) : null].filter(Boolean).join(" ") ||
    undefined;

  const fieldProps = (field: SiteSettingsField, hint = true) => ({
    id: fieldId(field),
    name: field,
    "aria-invalid": error(field) ? true : undefined,
    "aria-describedby": describe(field, hint),
  });

  const messages = (field: SiteSettingsField, hint?: string) => (
    <>
      {hint ? (
        <p id={hintId(field)} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error(field) ? (
        <p id={errorId(field)} className="text-sm text-destructive">
          {error(field)}
        </p>
      ) : null}
    </>
  );

  const mediaField = (
    field: keyof typeof images,
    surface: "page" | "dark" = "page",
  ) => (
    <BrandMediaField
      name={field}
      label={t(`fields.${field}`)}
      hint={t(`fields.${field}Hint`)}
      value={images[field]}
      onChange={(mediaId) => setImages((current) => ({ ...current, [field]: mediaId }))}
      library={library}
      libraryError={mediaError}
      onUploaded={(uploaded) => setLibrary((current) => [uploaded, ...current])}
      error={error(field)}
      surface={surface}
    />
  );

  const normalizedAccent = accent.trim() ? normalizeAccentColor(accent) : null;
  const enabledLocales = interfaceLocales.filter((locale) => enabled.includes(locale));

  function toggleLocale(locale: InterfaceLocale, checked: boolean) {
    const next = checked ? [...enabled, locale] : enabled.filter((value) => value !== locale);
    setEnabled(next);
    // Keep the default among the enabled locales when possible.
    if (!checked && locale === defaultLocale) {
      const remaining = interfaceLocales.find((candidate) => next.includes(candidate));
      if (remaining) setDefaultLocale(remaining);
    }
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="revision" value={revision} />

      <Section title={t("sections.identity.title")} description={t("sections.identity.description")}>
        <div className="space-y-2">
          <Label htmlFor={fieldId("siteName")}>{t("fields.siteName")}</Label>
          <Input
            {...fieldProps("siteName")}
            defaultValue={values.siteName}
            maxLength={siteSettingsLimits.siteName}
            required
          />
          {messages("siteName", t("fields.siteNameHint"))}
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("tagline")}>{t("fields.tagline")}</Label>
          <Input
            {...fieldProps("tagline")}
            defaultValue={values.tagline}
            maxLength={siteSettingsLimits.tagline}
          />
          {messages("tagline", t("fields.taglineHint"))}
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("footerText")}>{t("fields.footerText")}</Label>
          <Textarea
            {...fieldProps("footerText")}
            defaultValue={values.footerText}
            maxLength={siteSettingsLimits.footerText}
            rows={3}
          />
          {messages("footerText", t("fields.footerTextHint"))}
        </div>
      </Section>

      <Section
        title={t("sections.appearance.title")}
        description={t("sections.appearance.description")}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {mediaField("logoLight")}
          {mediaField("logoDark", "dark")}
        </div>
        {mediaField("icon")}

        <div className="space-y-2">
          <Label htmlFor={fieldId("accentColor")}>{t("fields.accentColor")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              aria-label={t("fields.accentPicker")}
              value={normalizedAccent ?? fallbackPickerColor}
              onChange={(event) => setAccent(event.target.value)}
              className="h-9 w-12 cursor-pointer rounded-md border bg-background p-1"
            />
            <Input
              {...fieldProps("accentColor")}
              value={accent}
              onChange={(event) => setAccent(event.target.value)}
              placeholder="#2563eb"
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              className="w-32 font-mono"
            />
            {accent ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAccent("")}>
                {t("fields.accentClear")}
              </Button>
            ) : null}
          </div>
          {messages("accentColor", t("fields.accentColorHint"))}
          <AccentPreview accent={normalizedAccent} />
        </div>
      </Section>

      <Section title={t("sections.social.title")} description={t("sections.social.description")}>
        <p id="site-settings-social-hint" className="text-xs text-muted-foreground">
          {t("fields.socialHint")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {socialProviders.map((provider) => {
            const field = `social.${provider}` as const;
            return (
              <div key={provider} className="space-y-2">
                <Label htmlFor={fieldId(field)}>
                  {provider === "website" ? t("fields.website") : socialProviderNames[provider]}
                </Label>
                <Input
                  id={fieldId(field)}
                  name={field}
                  type="url"
                  inputMode="url"
                  defaultValue={values.social[provider] ?? ""}
                  maxLength={siteSettingsLimits.socialUrl}
                  placeholder="https://"
                  aria-invalid={error(field) ? true : undefined}
                  aria-describedby={
                    ["site-settings-social-hint", error(field) ? errorId(field) : null]
                      .filter(Boolean)
                      .join(" ")
                  }
                />
                {messages(field)}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={t("sections.language.title")} description={t("sections.language.description")}>
        <fieldset
          className="space-y-3"
          aria-describedby={describe("enabledLocales")}
          aria-invalid={error("enabledLocales") ? true : undefined}
        >
          <legend className="text-sm font-medium">{t("fields.enabledLocales")}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {interfaceLocales.map((locale) => (
              <div key={locale} className="flex items-center gap-2">
                <Checkbox
                  id={`site-settings-locale-${locale}`}
                  name="enabledLocales"
                  value={locale}
                  checked={enabled.includes(locale)}
                  onCheckedChange={(checked) => toggleLocale(locale, checked === true)}
                />
                <Label htmlFor={`site-settings-locale-${locale}`} lang={locale}>
                  {interfaceLocaleNames[locale]}
                </Label>
              </div>
            ))}
          </div>
          {messages("enabledLocales", t("fields.enabledLocalesHint"))}
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor={fieldId("defaultLocale")}>{t("fields.defaultLocale")}</Label>
          <NativeSelect
            {...fieldProps("defaultLocale")}
            value={defaultLocale}
            onChange={(event) => setDefaultLocale(event.target.value)}
          >
            {(enabledLocales.length > 0 ? enabledLocales : interfaceLocales).map((locale) => (
              <NativeSelectOption key={locale} value={locale} lang={locale}>
                {interfaceLocaleNames[locale]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {messages("defaultLocale", t("fields.defaultLocaleHint"))}
        </div>
      </Section>

      <Section title={t("sections.seo.title")} description={t("sections.seo.description")}>
        <div className="space-y-2">
          <Label htmlFor={fieldId("metaDescription")}>{t("fields.metaDescription")}</Label>
          <Textarea
            {...fieldProps("metaDescription")}
            defaultValue={values.metaDescription}
            maxLength={siteSettingsLimits.metaDescription}
            rows={3}
          />
          {messages("metaDescription", t("fields.metaDescriptionHint"))}
        </div>
        {mediaField("ogImage")}
        <div className="flex items-start gap-3">
          <Checkbox
            id="site-settings-searchIndexing"
            name="searchIndexing"
            defaultChecked={values.searchIndexing}
            aria-describedby="site-settings-searchIndexing-hint"
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label htmlFor="site-settings-searchIndexing">{t("fields.searchIndexing")}</Label>
            <p id="site-settings-searchIndexing-hint" className="text-xs text-muted-foreground">
              {t("fields.searchIndexingHint")}
            </p>
          </div>
        </div>
      </Section>

      {state.status === "error" && state.message ? (
        <FormAlert tone="error">{state.message}</FormAlert>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? tForm("saving") : tForm("save")}
      </Button>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
}

// Live preview of the accent in both themes, on fixed theme surfaces, with
// the same palette the root layout will apply (accentPalette).
function AccentPreview({ accent }: { accent: string | null }) {
  const t = useTranslations("adminSettings.accent");

  if (!accent) {
    return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  }

  const palette = accentPalette(accent);
  // Fixed preview surfaces: --background of each theme in globals.css.
  const themes: { key: "light" | "dark"; surface: string; text: string; accent: ThemeAccent }[] = [
    { key: "light", surface: "#ffffff", text: "#0a0a0a", accent: palette.light },
    { key: "dark", surface: "#0a0a0a", text: "#fafafa", accent: palette.dark },
  ];

  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-sm font-medium">{t("preview")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {themes.map(({ key, surface, text, accent: theme }) => (
          <div
            key={key}
            className="space-y-3 rounded-lg border p-4"
            style={{ background: surface, color: text }}
          >
            <p className="text-xs font-medium">{t(key)}</p>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium"
                style={{ background: theme.color, color: theme.foreground }}
              >
                {t("sampleButton")}
              </span>
              <span className="text-sm underline underline-offset-4" style={{ color: theme.color }}>
                {t("sampleLink")}
              </span>
            </div>
            <p className="text-xs">
              {t("contrast", { ratio: theme.contrast.toFixed(1) })}
            </p>
            {theme.adjusted ? (
              <p className="text-xs">{t("adjusted", { color: theme.color })}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
