// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTITY_TAB_ID,
  ENTITY_TAB_KIND,
  installEntityTab,
  makeEntityTabBody,
  openEntityInSidebar,
} from "../../src/client/entity-tab";
import type { Entity } from "../../src/core/schema";

const one: Entity = {
  id: "one",
  kind: "Film",
  title: "One",
  description: "First entity",
  related: ["two"],
};
const two: Entity = { id: "two", kind: "Film", title: "Two" };

let host: HTMLDivElement;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  host.remove();
  sessionStorage.clear();
});

describe("native entity tab", () => {
  it("opens the entity in the right column with both params", () => {
    const openTab = vi.fn();
    expect(
      openEntityInSidebar({ sidebarRight: { openTab } }, one, [one, two]),
    ).toBe(true);
    expect(openTab).toHaveBeenCalledWith(ENTITY_TAB_KIND, {
      params: { entity: one, entities: [one, two] },
    });
  });

  it("declines without a column and when the host throws", () => {
    expect(openEntityInSidebar({}, one, [one])).toBe(false);
    expect(
      openEntityInSidebar(
        {
          sidebarRight: {
            openTab: () => {
              throw new Error("no session");
            },
          },
        },
        one,
        [one],
      ),
    ).toBe(false);
  });

  it("registers the type, body and title, then releases them", () => {
    const releaseType = vi.fn();
    const releaseBody = vi.fn();
    const releaseTitle = vi.fn();
    const register = vi.fn(() => releaseType);
    const slotInject = vi.fn((_name: string, callback: () => () => void) =>
      callback(),
    );
    const slotRegister = vi
      .fn()
      .mockReturnValueOnce(releaseBody)
      .mockReturnValueOnce(releaseTitle);
    const disposeSeat = vi.fn();
    const ctx = {
      inject: vi.fn(
        (
          _names: string[],
          callback: (injected: { get(name: string): unknown }) => void,
        ) => {
          callback({ get: () => ({ register }) });
          return disposeSeat;
        },
      ),
      slots: { inject: slotInject, register: slotRegister },
    };
    const handle = installEntityTab(ctx as never);
    expect(handle.ready()).toBe(true);
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ id: ENTITY_TAB_ID, kind: ENTITY_TAB_KIND }),
    );
    expect(slotRegister).toHaveBeenCalledTimes(2);
    expect(slotRegister.mock.calls[0]![0]).toMatchObject({
      name: "sidebar.right.pane.tab",
      key: ENTITY_TAB_ID,
    });
    expect(slotRegister.mock.calls[1]![0]).toMatchObject({
      name: "sidebar.right.pane.tab.title",
      key: ENTITY_TAB_ID,
    });
    handle.dispose();
    expect(handle.ready()).toBe(false);
    expect(disposeSeat).toHaveBeenCalled();
    expect(releaseType).toHaveBeenCalled();
    expect(releaseBody).toHaveBeenCalled();
    expect(releaseTitle).toHaveBeenCalled();
  });

  it("keeps the body registered when the tab type is re-injected", () => {
    const releaseBody = vi.fn();
    const releaseTitle = vi.fn();
    let injectTabType: (() => void) | undefined;
    const register = vi.fn(() => vi.fn());
    const ctx = {
      inject: vi.fn(
        (
          _names: string[],
          callback: (injected: { get(name: string): unknown }) => void,
        ) => {
          injectTabType = () => callback({ get: () => ({ register }) });
          injectTabType();
          return vi.fn();
        },
      ),
      slots: {
        inject: vi.fn((_name: string, callback: () => () => void) =>
          callback(),
        ),
        register: vi
          .fn()
          .mockReturnValueOnce(releaseBody)
          .mockReturnValueOnce(releaseTitle),
      },
    };
    const handle = installEntityTab(ctx as never);
    expect(handle.ready()).toBe(true);
    expect(releaseBody).not.toHaveBeenCalled();
    // The service re-injects: only the type is replaced, not the pane body.
    injectTabType!();
    expect(handle.ready()).toBe(true);
    expect(releaseBody).not.toHaveBeenCalled();
    expect(releaseTitle).not.toHaveBeenCalled();
    handle.dispose();
    expect(handle.ready()).toBe(false);
    expect(releaseBody).toHaveBeenCalledTimes(1);
    expect(releaseTitle).toHaveBeenCalledTimes(1);
  });

  it("refuses to open the sidebar until its body and title are registered", () => {
    const openTab = vi.fn();
    let ready = false;
    expect(
      openEntityInSidebar(
        { sidebarRight: { openTab } },
        one,
        [one],
        () => ready,
      ),
    ).toBe(false);
    expect(openTab).not.toHaveBeenCalled();
    ready = true;
    expect(
      openEntityInSidebar(
        { sidebarRight: { openTab } },
        one,
        [one],
        () => ready,
      ),
    ).toBe(true);
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it("restores the last entity when the host loses tab params on reload", async () => {
    openEntityInSidebar({ sidebarRight: { openTab: vi.fn() } }, one, [
      one,
      two,
    ]);
    const Body = makeEntityTabBody(vi.fn(() => true));
    const root = createRoot(host);
    await act(async () => {
      root.render(<Body useTabInfo={() => ({ tab: { navigation: {} } })} />);
    });
    expect(host.textContent).toContain("One");
    expect(host.textContent).toContain("First entity");
    await act(async () => root.unmount());
  });

  it("releases the first slot when the second registration throws", () => {
    const releaseBody = vi.fn();
    const injectSlot = vi
      .fn()
      .mockImplementationOnce((_name: string, callback: () => () => void) =>
        callback(),
      )
      .mockImplementationOnce(() => {
        throw new Error("slot unavailable");
      });
    const ctx = {
      inject: vi.fn(() => vi.fn()),
      slots: { inject: injectSlot, register: vi.fn(() => releaseBody) },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = installEntityTab(ctx as never);
    expect(handle.ready()).toBe(false);
    expect(releaseBody).toHaveBeenCalledTimes(1);
    handle.dispose();
    expect(releaseBody).toHaveBeenCalledTimes(1);
  });

  it("releases slots when the tab service subscription throws", () => {
    const releaseBody = vi.fn();
    const releaseTitle = vi.fn();
    const slotRegister = vi
      .fn()
      .mockReturnValueOnce(releaseBody)
      .mockReturnValueOnce(releaseTitle);
    const ctx = {
      inject: vi.fn(() => {
        throw new Error("service unavailable");
      }),
      slots: {
        inject: vi.fn((_name: string, callback: () => () => void) =>
          callback(),
        ),
        register: slotRegister,
      },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = installEntityTab(ctx as never);
    expect(handle.ready()).toBe(false);
    expect(releaseBody).toHaveBeenCalledTimes(1);
    expect(releaseTitle).toHaveBeenCalledTimes(1);
  });

  it("finishes cleanup when one release throws", () => {
    const releaseBody = vi.fn(() => {
      throw new Error("release failed");
    });
    const releaseTitle = vi.fn();
    const releaseType = vi.fn(() => {
      throw new Error("type release failed");
    });
    const ctx = {
      inject: vi.fn(
        (
          _names: string[],
          callback: (injected: { get(name: string): unknown }) => void,
        ) => {
          callback({ get: () => ({ register: vi.fn(() => releaseType) }) });
          return vi.fn(() => {
            throw new Error("seat release failed");
          });
        },
      ),
      slots: {
        inject: vi.fn((_name: string, callback: () => () => void) =>
          callback(),
        ),
        register: vi
          .fn()
          .mockReturnValueOnce(releaseBody)
          .mockReturnValueOnce(releaseTitle),
      },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = installEntityTab(ctx as never);
    expect(handle.ready()).toBe(true);
    expect(() => handle.dispose()).not.toThrow();
    expect(releaseType).toHaveBeenCalledTimes(1);
    expect(releaseBody).toHaveBeenCalledTimes(1);
    expect(releaseTitle).toHaveBeenCalledTimes(1);
  });

  it("ignores a late service callback after disposal", () => {
    let late: (() => void) | undefined;
    const register = vi.fn(() => vi.fn());
    const ctx = {
      inject: vi.fn(
        (
          _names: string[],
          callback: (injected: { get(name: string): unknown }) => void,
        ) => {
          late = () => callback({ get: () => ({ register }) });
          return vi.fn();
        },
      ),
      slots: {
        inject: vi.fn((_name: string, callback: () => () => void) =>
          callback(),
        ),
        register: vi.fn(() => vi.fn()),
      },
    };
    const handle = installEntityTab(ctx as never);
    handle.dispose();
    late!();
    expect(register).not.toHaveBeenCalled();
  });

  it("renders the shared details and follows related entities in the same tab", async () => {
    const open = vi.fn(() => true);
    const Body = makeEntityTabBody(open);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Body
          useTabInfo={() => ({
            tab: {
              navigation: { params: { entity: one, entities: [one, two] } },
            },
          })}
        />,
      );
    });
    expect(host.textContent).toContain("One");
    expect(host.textContent).toContain("First entity");
    const related = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Two"),
    )!;
    await act(async () => {
      related.click();
    });
    expect(open).toHaveBeenCalledWith(two, [one, two]);
    await act(async () => root.unmount());
  });
});
