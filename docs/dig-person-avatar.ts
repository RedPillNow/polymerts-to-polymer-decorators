namespace Dig {
    @component("dig-person-avatar")
    export class DigPersonAvatar extends NowElements.BaseElement {
        /**
         * The name for this avatar
         * @type {Dig.Name}
         */
        @property({
            type: String
        })
        name: Dig.Name;
        /**
         * The person for this avatar
         * @type {Dig.Person}
         */
        @property({
            type: Object,
            value: null
        })
        person: Dig.Person;
        /**
         * The URL for the avatar
         * @type {string}
         */
        @property({
            type: String,
            value: null
        })
        avatarUrl: string;
        /**
         * true if the pop over dialog is disabled
         * @type {boolean}
         */
        @property({
            type: Boolean,
            value: false,
            reflectToAttribute: true
        })
        disablePopover: boolean;
        /**
         * The position of the popover
         * @type {string}
         */
        @property({
            type: String
        })
        popoverPosition: string;
        /**
         * true if we should show 2 letters, otherwise we'll always show 1 letter
         * @type {boolean}
         */
        @property({
            type: Boolean,
            value: false
        })
        showTwoLetters: boolean;
        /**
         * true if the person object is being fetched
         * @type {boolean}
         */
        @property({
            type: Boolean,
            value: false,
            notify: true
        })
        personLoading: boolean;
        /**
         * true if the Letter should be hidden
         * @param {Dig.Name} name
         * @returns {boolean}
         */
        @computed("name", "person", "avatarUrl")
        get hideLetter() {
            let returnVal = !avatarUrl && name ? false : true;
            // console.log(this.is, 'hideLetter returning', returnVal);
            return returnVal;
        }
        /**
         * true if the image should be hidden
         * @param {Dig.Name} name
         * @returns {boolean}
         */
        @computed("name", "person", "avatarUrl")
        get hideImage() {
            let returnVal = avatarUrl && name ? false : true;
            // console.log(this.is, 'hideImage returning', returnVal);
            return returnVal;
        }
        /**
         * true if the icon is hidden
         * @param {Dig.Name} name
         * @returns {boolean}
         */
        @computed("name", "person", "avatarUrl")
        get hideIcon() {
            let returnVal = !avatarUrl && !name ? false : true;
            // console.log(this.is, 'hideIcon returning', returnVal);
            return returnVal;
        }
        /**
         * Determine the letter(s) to show in the avatar
         * @param {Dig.Name} name
         * @returns {string}
         */
        @computed("name", "showTwoLetters")
        get avatarLetter() {
            if (name) {
                if (showTwoLetters) {
                    return name.firstNameLetter + name.lastNameLetter;
                }
                return name.firstNameLetter;
            }
            return null;
        }
        @computed("settings")
        get frameUrl() {
            return settings ? settings.getApiUrl("frame") : undefined;
        }
        attached() {
            let stupidity = this.settings;
        }
        /**
         * Fired when the name changes. Will set the background and color colors
         * @private
         * @param {Dig.Name} name
         */
        private _onName(name: Dig.Name) {
            // this.avatarUrl = null;
            if (name && !(name instanceof Dig.Name)) {
                this.name = new Dig.Name(name);
            }
            else if (name && name instanceof Dig.Name) {
                this.title = name.abbreviatedName;
                if (name.backgroundColor) {
                    this.$.avatarContainer.style.backgroundColor = name.backgroundColor;
                    this.$.avatarContainer.style.color = name.contrastingColor;
                }
                let digApp = this.app ? this.app : window.app;
                if (digApp && (<Dig.App>digApp).personCache && (<Dig.App>digApp).personCache[name.canonicalName] && !this.person) {
                    this.person = (<Dig.App>digApp).personCache[name.canonicalName];
                }
            }
        }
        /**
         * Fired when a response is received from fetching the person
         * for the popover. Will ensure that we've got a Dig.Person
         * @param {Object} person
         */
        private _onPerson(person) {
            if (person && !(person instanceof Dig.Person)) {
                this.person = new Dig.Person(person);
            }
            else if (person && person instanceof Dig.Person) {
                this.avatarUrl = person.photoUrl || null;
                if (!this.name) {
                    this.set("name", person.fullName.canonicalName);
                }
                if (this.app) {
                    if ((<Dig.App>this.app).personCache && !(<Dig.App>this.app).personCache[this.name.canonicalName]) {
                        (<Dig.App>this.app).personCache[this.name.canonicalName] = person;
                    }
                }
            }
        }
        /**
         * Toggle the loading class on this element based on if personLoading
         * @private
         * @param {any} personLoading
         */
        private _onPersonLoading(personLoading) {
            this.toggleClass("loader", personLoading, this.$.loader);
        }
        /**
         * When the avatar popover is tapped, fetch the person
         * @private
         * @param {any} evt
         * @param {any} detail true if the popover is showing
         * @listens tap
         */
        @listen("tap")
        private _onAvatarTap(evt, detail) {
            // console.log(this.is, '_onAvatarTap', arguments);
            evt.stopPropagation();
            if (detail && !this.disablePopover) {
                let person = null;
                if (this.app) {
                    person = (<Dig.App>this.app).personCache[this.name.canonicalName];
                    this.person = person;
                }
                if (!person && !this.person) {
                    // console.log(this.is, '_onAvatarTap, fetch person');
                    this.fetchPerson().completes.then(() => {
                        this.$.popover.show();
                    });
                }
                else {
                    // console.log(this.is, '_onAvatarTap, popover showing=', this.$.popover.showing);
                    if (!this.$.popover.showing) {
                        // console.log(this.is, '_onAvatarTap, show popover');
                        this.$.popover.show();
                    }
                    else {
                        // console.log(this.is, '_onAvatarTap, hide popover');
                        this.$.popover.hide();
                    }
                }
            }
        }
        get foo() {
            return "foo";
        }
        /**
         * Close this avatar's popover
         * @param {any} evt
         * @param {any} detail
         * @listens #closeButton.tap
         */
        closePopover(evt, detail) {
            // console.log(this.is, 'closePopover', arguments);
            if (evt) {
                evt.stopPropagation();
            }
            this.$.popover.hide();
        }
        /**
         * Fetch the person associated with the name
         * @return {Promise}
         */
        fetchPerson() {
            if (this.name && this.name.canonicalName) {
                let ajax = this.$.personAjax;
                ajax.params = {
                    type: "com.redpill.rest.extensions.user.User",
                    key: this.name.canonicalName
                };
                return ajax.generateRequest();
            }
        }
    }
}
Dig.DigPersonAvatar.register();
