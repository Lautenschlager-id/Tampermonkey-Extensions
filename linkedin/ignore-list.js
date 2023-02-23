// ==UserScript==
// @name         [LINKEDIN] Ignore List
// @namespace    @Lautenschlager.id
// @version      0.1
// @description  Allows you to select company names that you'd like to get rid of your feed
// @author       Tai Lautenschlager
// @match        https://www.linkedin.com/feed/
// @require      http://userscripts-mirror.org/scripts/source/107941.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

const cookieKey = {
    "company": "linkedin_custom_ignore_list_company"
};

let ignoreCompanyList,
    feedElement, feedProcessedIDs = { };

///////////////// UTILS /////////////////
function loadIgnoreLists()
{
    ignoreCompanyList = GM_SuperValue.get(cookieKey.company) || { };
}

function saveIgnoreList(type)
{
    switch (type)
    {
        case "company":
        {
            GM_SuperValue.set(cookieKey.company, ignoreCompanyList);
            break;
        }
    }

    return true;
}

function normalizeStringForRegExp(str)
{
    return str.replace(/([\^\$\[\]\(\)\+\*\?\{\}\.])/g, "\\$1");
}

function normalizeStringForHTML(str)
{
    return str.replace(/</g, "&lt;");
}

function _callCallbackAndVerifyIntervalState([bindIntervalReference], callback, ...arguments)
{
    try
    {
        if (!callback(...arguments))
            return;
    }
    catch(err)
    {
        console.log("_callCallbackAndVerifyIntervalState", err);
        return;
    }
    clearInterval(bindIntervalReference);
}

function retryCallbackUntilSuccess(callback, interval, ...arguments)
{
    // Callback should return true / false

    if (callback(...arguments))
        return;

    const bindIntervalReference = [];
    bindIntervalReference[0] = setInterval(_callCallbackAndVerifyIntervalState, interval, bindIntervalReference, callback, ...arguments);
}

///////////////// EXTRACTOR /////////////////
function loadFeed()
{
    feedElement = document.getElementsByClassName("scaffold-finite-scroll__content")[0];
}

function getPostID(mainDiv)
{
    // Posts are unique by their <div><div data-id="...:ID" /></div>
    return mainDiv.firstElementChild
        ?.dataset.id
        ?.match(/(\d+)$/)?.[0];
}

function verifyPostContentCompanies(mainDiv)
{
    const postDescriptionContent = mainDiv.firstElementChild.getElementsByClassName("feed-shared-update-v2__description-wrapper")[0].innerHTML;

    for (const companyName of Object.keys(ignoreCompanyList))
    {
        // When a post mentions a company, that's the HTML referenced
        const regex = new RegExp(`<a [^>]*?href="https://www.linkedin.com/company/[^"]+"[^>]*?>${normalizeStringForRegExp(companyName)}</a>`, "i");
        if (regex.test(postDescriptionContent))
        {
            console.log("Post removed", companyName);
            mainDiv.remove();
        }
    }
}

function onFeedUpdated()
{
    for (const child of feedElement.children)
    {
        const postID = getPostID(child);

        if (!postID || feedProcessedIDs[postID])
            continue;

        // By setting to true we are avoiding that the processing time after this line allows processing the data 2x or more
        feedProcessedIDs[postID] = true;

        try
        {
            verifyPostContentCompanies(child);
        }
        catch
        {
            // Allows the post to be processed again later
            feedProcessedIDs[postID] = false;
        }
    }
}

function bindFeedUpdates()
{
    loadFeed();

    if (!feedElement)
        return false;

    const observer = new MutationObserver(onFeedUpdated);

    observer.observe(feedElement, {
        childList: true
    });
    onFeedUpdated();

    return true;
}

///////////////// LISTING /////////////////
function rebuildIgnoreLists()
{
    for (const list of document.getElementsByClassName("ignore-list"))
        list.remove();
    retryCallbackUntilSuccess(renderIgnoreLists, 1000);
}

function _getCompanyBulletItem(companyName)
{
    return `
<li class="news-module__storyline">
    <a class="ember-view news-module__link link-without-hover-state block">
        <div class="news-module__headline t-14 t-bold t-black truncate mt1 pr4">
            <button data-del-content="${btoa(companyName)}" data-del-type="company" class="delete-from-list feed-shared-control-menu__hide-post-button artdeco-button artdeco-button--circle artdeco-button--muted artdeco-button--1 artdeco-button--tertiary ember-view">
                <li-icon type="cancel-icon" class="artdeco-button__icon" size="small">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" data-supported-dps="16x16" fill="currentColor" class="mercado-match" width="16" height="16" focusable="false">
                        <path d="M14 3.41L9.41 8 14 12.59 12.59 14 8 9.41 3.41 14 2 12.59 6.59 8 2 3.41 3.41 2 8 6.59 12.59 2z" />
                    </svg>
                </li-icon>
                <span class="artdeco-button__text" />
            </button>
            ${normalizeStringForHTML(companyName)}
        </div>
    </a>
</li>`;
}

function _removeItemFromList(button)
{
    const { delContent, delType } = button.dataset;
    if (!(delContent && delType))
        return;

    switch (delType)
    {
        case "company":
        {
            const companyName = atob(delContent);
            delete ignoreCompanyList[companyName];

            saveIgnoreList(delType);

            button.parentElement.remove();
            break;
        }
    }
}

function _addItemToList(input)
{
    const { addType } = input.dataset;
    const { value: itemToBeAdded } = input;

    if (!(addType && itemToBeAdded))
        return;

    switch (addType)
    {
        case "company":
        {
            ignoreCompanyList[itemToBeAdded] = true;

            saveIgnoreList(addType);

            input.value = '';

            // Sorts the names
            rebuildIgnoreLists();
            break;
        }
    }

    input.blur();
}

function bindIgnoreLists(rightLayoutDiv)
{
    for (const button of rightLayoutDiv.getElementsByClassName("delete-from-list"))
        button.onclick = () => _removeItemFromList(button);

    for (const input of rightLayoutDiv.getElementsByClassName("add-to-list"))
        input.onkeyup = ({key}) => (key === "Enter") && _addItemToList(input);

    return true;
}

function renderIgnoreLists()
{
    const rightLayoutDiv = document.getElementsByClassName("scaffold-layout__aside")?.[0];
    const newsDiv = rightLayoutDiv?.getElementsByClassName("mb2")?.[0];

    if (!newsDiv)
        return false;

    // Resets because there might be new values
    feedProcessedIDs = { };

    newsDiv.outerHTML += `
<div class="mb2 ignore-list">
    <section class="artdeco-card ember-view">
        <div class="ember-view">
            <div class="news-module pv3">
                <div class="news-module__header display-flex ph3">
                    <h2 class="news-module__title t-16 t-black">
                        <span class="t-16 t-black t-bold">
                            Ignore List - Companies
                        </span>
                    </h2>
                </div>
                <hr>
                <div class="search-typeahead-v2 search-global-typeahead__typeahead">
                    <input data-add-type="company" class="add-to-list search-global-typeahead__input" placeholder="Add to ignore list" role="combobox" type="text">
                    <div class="search-global-typeahead__search-icon-container">
                        <li-icon type="search" class="search-global-typeahead__search-icon" size="small">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" data-supported-dps="16x16" fill="currentColor" class="mercado-match" width="16" height="16" focusable="false">
                                <use href="#add-small" width="16" height="16"></use>
                            </svg>
                        </li-icon>
                    </div>
                </div>
                <hr>
                <ul class="mt2 list-style-none mb1">
                    ${Object.keys(ignoreCompanyList)
                        .sort()
                        .map(_getCompanyBulletItem)
                        .join("\n")}
                </ul>
            </div>
        </div>
    </section>
</div>`;

    retryCallbackUntilSuccess(bindIgnoreLists, 1000, rightLayoutDiv);
    return true;
}

///////////////// INITIALIZE /////////////////
window.onload = function()
{
    retryCallbackUntilSuccess(bindFeedUpdates, 1000);
    retryCallbackUntilSuccess(renderIgnoreLists, 1000);
};

(function() {
    'use strict';

    loadIgnoreLists();
})();
