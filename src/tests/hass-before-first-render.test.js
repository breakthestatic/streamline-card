import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Regression test: inner card renders before it receives `hass`
 *
 * Bug: Streamline Card attaches the inner card to its shadow root as soon as it
 * is created, but only forwards `hass` on the next animation frame. Lit-based
 * cards render in a microtask once connected, so their first render runs with
 * `hass` undefined. Cards that read `hass` in render() throw, e.g. the map card:
 * "Cannot read properties of undefined (reading 'themes')".
 *
 * Expected: The inner card already has `hass` when it first renders, using the
 * order Home Assistant uses (setConfig, then hass, then connect).
 */

vi.mock("../getLovelace-helper", () => ({
  getLovelace: () => ({
    config: {
      streamline_templates: {
        hass_template: { card: { type: "map" } },
      },
    },
  }),
  getLovelaceCast: () => null,
}));

vi.mock("../templateLoader", () => ({
  getIsTemplateLoaded: () => true,
  getRemoteTemplates: () => ({}),
  loadRemoteTemplates: () => Promise.resolve(),
}));

// Behaves like a Lit card: the first render happens in a microtask after connect
class FakeLitCard extends HTMLElement {
  setConfig(config) {
    this.config = config;
  }

  connectedCallback() {
    queueMicrotask(() => {
      this.hassAtFirstRender = this.hass;
    });
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const hass = { states: {}, themes: { darkMode: false } };

describe("Inner card receives hass before its first render", () => {
  beforeAll(async () => {
    customElements.define("fake-lit-card", FakeLitCard);
    window.loadCardHelpers = () =>
      Promise.resolve({
        createCardElement: (config) => {
          const card = document.createElement("fake-lit-card");
          card.setConfig(config);
          return card;
        },
      });
    await import("../streamline-card");
    await customElements.whenDefined("streamline-card");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("should pass hass before the inner card first renders", async () => {
    const card = document.createElement("streamline-card");
    card.setConfig({ template: "hass_template" });
    card.hass = hass;
    document.body.appendChild(card);
    await flushMicrotasks();

    expect(card._card.hassAtFirstRender).toBe(hass);
  });

  it("should pass hass to a recreated inner card before it first renders", async () => {
    const card = document.createElement("streamline-card");
    card.setConfig({ template: "hass_template" });
    card.hass = hass;
    document.body.appendChild(card);
    await flushMicrotasks();
    const previousCard = card._card;

    window.dispatchEvent(new Event("streamline-templates-updated"));
    await flushMicrotasks();

    expect(card._card).not.toBe(previousCard);
    expect(card._card.hassAtFirstRender).toBe(hass);
  });
});
