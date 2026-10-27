import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * Regression test: "Cannot read properties of null (reading 'dispatchEvent')"
 *
 * Bug: When a template comes from streamline_templates.yaml, the card waits for
 * the file to load, creates the inner card, then fires "card-updated" on
 * `this.parentNode`. Home Assistant does not attach a card that is hidden by
 * its visibility conditions (hui-card removes it), and calls setConfig before
 * attaching visible ones, so `parentNode` can be null and fireEvent throws.
 *
 * Expected: Loading remote templates never throws for a detached card, and an
 * attached card still notifies its hui-card parent with "card-updated".
 */

const loader = vi.hoisted(() => ({
  loaded: null,
  remote: {},
  resolve: undefined,
}));

vi.mock("../getLovelace-helper", () => ({
  getLovelace: () => ({ config: {} }),
  getLovelaceCast: () => null,
}));

vi.mock("../templateLoader", () => ({
  getIsTemplateLoaded: () => loader.loaded,
  getRemoteTemplates: () => loader.remote,
  loadRemoteTemplates: () =>
    new Promise((resolve) => {
      loader.resolve = () => {
        loader.remote = { remote_template: { card: { type: "map" } } };
        loader.loaded = true;
        resolve(true);
      };
    }),
}));

const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

// Node's process, used to catch the async error thrown inside the template loading promise
const nodeProcess = globalThis.process;

describe("card-updated after remote templates load", () => {
  beforeAll(async () => {
    window.loadCardHelpers = () =>
      Promise.resolve({
        createCardElement: () => {
          const card = document.createElement("div");
          card.setConfig = vi.fn();
          return card;
        },
      });
    await import("../streamline-card");
    await customElements.whenDefined("streamline-card");
  });

  beforeEach(() => {
    loader.loaded = null;
    loader.remote = {};
    loader.resolve = undefined;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("should not throw when the card is not attached", async () => {
    const errors = [];
    const onError = (error) => errors.push(error);
    nodeProcess.on("unhandledRejection", onError);

    const card = document.createElement("streamline-card");
    card.setConfig({ template: "remote_template" });
    loader.resolve();
    await flush();

    nodeProcess.off("unhandledRejection", onError);
    expect(errors).toEqual([]);
    expect(card._card).toBeDefined();
  });

  it("should notify the parent when the card is attached", async () => {
    const parent = document.createElement("div");
    const onCardUpdated = vi.fn();
    parent.addEventListener("card-updated", onCardUpdated);
    document.body.appendChild(parent);

    const card = document.createElement("streamline-card");
    card.setConfig({ template: "remote_template" });
    parent.appendChild(card);
    loader.resolve();
    await flush();

    expect(onCardUpdated).toHaveBeenCalledTimes(1);
  });
});
