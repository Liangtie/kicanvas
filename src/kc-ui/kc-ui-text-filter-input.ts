/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { CSS } from "../base/dom/css";
import { html, CustomElement } from "../base/dom/custom-element";
import styles from "./kc-ui-text-filter-input.css";

export class KCUITextFilterInputElement extends CustomElement {
    static override exportparts = ["icon"];
    static override styles = new CSS(styles);

    get input() {
        return this.$<HTMLInputElement>("input")!;
    }

    get value() {
        return this.input.value;
    }

    set value(v) {
        this.input.value = v;
        this.input.dispatchEvent(
            new Event("input", { bubbles: true, composed: true }),
        );
    }

    override initialContentCallback(): void | undefined {
        super.initialContentCallback();

        this.$("button")!.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.value = "";
        });
    }

    override render() {
        return html`<kc-ui-icon class="flex before" part="icon"
                >search</kc-ui-icon
            >
            <input style="" type="text" placeholder="search" name="search" />
            <button type="button">
                <kc-ui-icon part="icon">close</kc-ui-icon>
            </button>`;
    }
}

window.customElements.define(
    "kc-ui-text-filter-input",
    KCUITextFilterInputElement,
);