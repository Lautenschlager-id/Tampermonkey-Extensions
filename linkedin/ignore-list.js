// ==UserScript==
// @name         [LINKEDIN] Ignore List
// @namespace    @Lautenschlager.id
// @version      0.2
// @description  Allows you to select company names and specific terms that you'd like to get rid of your feed
// @author       Tai Lautenschlager
// @match        https://www.linkedin.com/feed*
// @require      http://userscripts-mirror.org/scripts/source/107941.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

const IMPLEMENT_FOLLOWING_IGNORE_LISTS = {
    // For mentions of specific companies.
    "company": "company",
    // For mentions of specific terms.
    "term": "term"
};

const cookieKey = (() => {
    const list = { };
    for (const listName in IMPLEMENT_FOLLOWING_IGNORE_LISTS)
        list[listName] = `linkedin_custom_ignore_list_${listName}`;
    return list;
})();
const ignoreList = (() => {
    const list = { };
    for (const listName in IMPLEMENT_FOLLOWING_IGNORE_LISTS)
        list[listName] = { };
    return list;
})();
const verifyPostContentForIgnoreList = (() => {
    const list = { };
    for (const listName in IMPLEMENT_FOLLOWING_IGNORE_LISTS)
        list[listName] = undefined;
    return list;
})();
const customListSetting = (() => {
    const list = { };
    for (const listName in IMPLEMENT_FOLLOWING_IGNORE_LISTS)
        list[listName] = undefined;
    return list;
})();

let feedElement, feedProcessedIDs = { };

///////////////// UTILS /////////////////
function loadIgnoreLists()
{
    ignoreList.company = GM_SuperValue.get(cookieKey.company) || { };
    ignoreList.term = GM_SuperValue.get(cookieKey.term) || { };
}

function saveIgnoreList(listType)
{
    if (!(cookieKey[listType] && ignoreList[listType]))
        return false;

    GM_SuperValue.set(cookieKey[listType], ignoreList[listType]);

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

    // Retry
    const bindIntervalReference = [];
    bindIntervalReference[0] = setInterval(_callCallbackAndVerifyIntervalState, interval, bindIntervalReference, callback, ...arguments);
}

function levenshteinDistance(str1, str2)
{
	const len1 = str1.length;
	const len2 = str2.length;
	const distances = new Array(len1 + 1).fill(null)
    	.map(() => new Array(len2 + 1).fill(null));

	for (let i = 0; i <= len1; i++)
		distances[i][0] = i;

	for (let j = 0; j <= len2; j++)
		distances[0][j] = j;

	for (let j = 1; j <= len2; j++)
		for (let i = 1; i <= len1; i++) {
			const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
			distances[i][j] = Math.min(
				distances[i - 1][j] + 1,
				distances[i][j - 1] + 1,
				distances[i - 1][j - 1] + cost
			);
		}

	return distances[len1][len2];
}

function textContainsTerm(text, term)
{
    const words = text.toLowerCase().split(' ');
    const termWords = term.toLowerCase().split(' ');

    const len = termWords.length;
    const threshold = Math.ceil(term.length * 0.3);

    for (let i = 0; i < words.length - len + 1; i++)
    {
        const wordsToCompare = words.slice(i, i + len);
        const distance = levenshteinDistance(wordsToCompare.join(' '), term);

        if (distance <= threshold)
            return true;
    }

    return false;
}

///////////////// HANDLER /////////////////
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

verifyPostContentForIgnoreList.company = function(postDescriptionContent, mainDiv)
{
    for (const companyName of Object.keys(ignoreList.company))
    {
        // When a post mentions a company, that's the HTML referenced
        const regex = new RegExp(`<a [^>]*?href="https://www\.linkedin\.com/company/[^"]+"[^>]*?>${normalizeStringForRegExp(companyName)}</a>`, "i");
        if (regex.test(postDescriptionContent))
        {
            console.log("[Company removal] Post removed - ", companyName);
            mainDiv.remove();
            return false;
        }
    }
    return true;
};

verifyPostContentForIgnoreList.term = function(postDescriptionContent, mainDiv)
{
    const termList = ignoreList.term;
    for (const term of Object.keys(termList))
    {
        let conditionResult;

        const method = termList[term].method * 1;
        switch (method)
        {
            case 2:
            {
                // compares the text to a term and checks its similarity
                conditionResult = textContainsTerm(postDescriptionContent, term);
                break;
            }
            case 3:
            {
                // compares the text with regular expression
                const regex = new RegExp(term, "i");
                conditionResult = regex.test(postDescriptionContent);
                break;
            }
            case 1:
            {
                // compares the text with a term that is composed of words
                const regex = new RegExp(`\\b${normalizeStringForRegExp(term)}\\b`, "i");
                conditionResult = regex.test(postDescriptionContent);
                break;
            }
            default:
            {
                // compares the text with a term that may be within other words
                const regex = new RegExp(normalizeStringForRegExp(term), "i");
                conditionResult = regex.test(postDescriptionContent);
            }
        }


        if (conditionResult)
        {
            console.log("[Term removal - ", customListSetting.term.selectOptions[method], "] Post removed - ", term);
            mainDiv.remove();
            return false;
        }
    }
    return true;
};

function verifyPostContentForIgnoreLists(mainDiv)
{
    const divChild = mainDiv.firstElementChild

    let postDescriptionContentWithHTML =
          // Regular post
          (divChild.getElementsByClassName("feed-shared-update-v2__description-wrapper")[0]?.innerHTML ?? '')
          // Reposting
        + (divChild.getElementsByClassName("feed-shared-inline-show-more-text")[0]?.innerHTML ?? '');

    let postDescriptionContentWithoutHTML, postDescriptionContent;

    for (const contentType in verifyPostContentForIgnoreList)
    {
        postDescriptionContent = postDescriptionContentWithHTML;

        if (!customListSetting[contentType].validateWithHTML)
        {
            if (!postDescriptionContentWithoutHTML)
                postDescriptionContentWithoutHTML = postDescriptionContentWithHTML.replace(/<[^>]+>/g, '');
            postDescriptionContent = postDescriptionContentWithoutHTML;
        }

        // true = Passed | false = Removed
        if (!verifyPostContentForIgnoreList[contentType](postDescriptionContent, mainDiv))
            return;
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
            verifyPostContentForIgnoreLists(child);
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

    // May require attention to memory consumption on future versions
    observer.observe(feedElement, {
        childList: true,
        attributes: true,
        characterData: true,
    });
    onFeedUpdated();

    return true;
}

///////////////// LISTING /////////////////
function rebuildIgnoreLists()
{
    for (const list of [...document.getElementsByClassName("ignore-list")])
        list.remove();

    // Resets because there might be new values
    feedProcessedIDs = { };

    // Not the best approach, I know
    retryCallbackUntilSuccess(renderIgnoreLists, 1000);
    retryCallbackUntilSuccess(onFeedUpdated, 1000);
}

customListSetting.company = {
    validateWithHTML: true,
};

customListSetting.term = {
    validateWithHTML: false,
    selectOptions: [ "Plain text", "Whole word(s) only", "Compare similarity", "Regular expression" ],
    parseSelectOptions: function(selectOption, optionIndex)
    {
        return `
<option value="${optionIndex}">
    #${optionIndex + 1} - ${selectOption}
</option>`;
    }
};
customListSetting.term.renderSearch = function()
{
    return `
<select class="search-method" required>
    ${customListSetting.term.selectOptions.map(customListSetting.term.parseSelectOptions)}
</select>`;
};
customListSetting.term.renderItem = function(itemName)
{
    return ` (#${(ignoreList.term[itemName]?.method || -2) * 1 + 1})`;
}
customListSetting.term.getSettings = function(input)
{
    const searchMethod = input.parentElement.parentElement
        .getElementsByClassName("search-method")[0]
        ?.value ?? "raw";

    return {
        "method": searchMethod,
    };
}

function _getBulletForIgnoreListItem(itemName, itemType)
{
    return `
<li class="news-module__storyline">
    <a class="ember-view news-module__link link-without-hover-state block">
        <div class="news-module__headline t-14 t-bold t-black truncate mt1 pr4">
            <button data-del-content="${btoa(itemName)}" data-del-type="${itemType}" class="delete-from-list feed-shared-control-menu__hide-post-button artdeco-button artdeco-button--circle artdeco-button--muted artdeco-button--1 artdeco-button--tertiary ember-view">
                <li-icon type="cancel-icon" class="artdeco-button__icon" size="small">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" data-supported-dps="16x16" fill="currentColor" class="mercado-match" width="16" height="16" focusable="false">
                        <path d="M14 3.41L9.41 8 14 12.59 12.59 14 8 9.41 3.41 14 2 12.59 6.59 8 2 3.41 3.41 2 8 6.59 12.59 2z" />
                    </svg>
                </li-icon>
                <span class="artdeco-button__text" />
            </button>
            ${normalizeStringForHTML(itemName)}${customListSetting[itemType]?.renderItem?.(itemName) ?? ''}
        </div>
    </a>
</li>`;
}

function _removeItemFromList(button)
{
    const { delContent, delType } = button.dataset;
    if (!(delContent && delType))
        return;

    const companyName = atob(delContent);
    delete ignoreList[delType][companyName];

    saveIgnoreList(delType);

    // Sorts the names and refreshes the cache
    rebuildIgnoreLists();
}

function _addItemToList(input)
{
    const { addType } = input.dataset;
    const itemToBeAdded = input.value?.trim();

    if (!(addType && itemToBeAdded))
        return;

    ignoreList[addType][itemToBeAdded] = customListSetting[addType]?.getSettings?.(input) ?? { };

    saveIgnoreList(addType);

    input.value = '';

    // Sorts the names and refreshes the cache
    rebuildIgnoreLists();

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
    const rightLayoutDiv = document.getElementsByClassName("scaffold-layout__aside")[0];
    const newsDiv = rightLayoutDiv?.getElementsByClassName("mb2")[0];

    if (!newsDiv)
        return false;

    const ignoreListDiv = rightLayoutDiv?.getElementsByClassName("ignore-list")[0];
    if (ignoreListDiv)
        return true;

    let outerHTML = '';
    for (const listName in verifyPostContentForIgnoreList)
        outerHTML += `
<div class="mb2 ignore-list">
    <section class="artdeco-card ember-view">
        <div class="ember-view">
            <div class="news-module pv3">
                <div class="news-module__header display-flex ph3">
                    <h2 class="news-module__title t-16 t-black">
                        <span class="t-16 t-black t-bold">
                            Ignore List for [${listName}]
                        </span>
                    </h2>
                </div>
                <hr>
                ${customListSetting[listName]?.renderSearch?.() ?? ''}
                <div class="search-typeahead-v2 search-global-typeahead__typeahead">
                    <input data-add-type="${listName}" class="add-to-list search-global-typeahead__input" placeholder="Add to ignore list" role="combobox" type="text">
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
                    ${Object.keys(ignoreList[listName])
                        .sort()
                        .map((itemName) => _getBulletForIgnoreListItem(itemName, listName))
                        .join("\n")}
                </ul>
            </div>
        </div>
    </section>
</div>`;

    newsDiv.outerHTML += outerHTML;

    retryCallbackUntilSuccess(bindIgnoreLists, 1000, rightLayoutDiv);
    return true;
}

///////////////// INITIALIZE /////////////////
(function() {
    'use strict';

    loadIgnoreLists();

    retryCallbackUntilSuccess(bindFeedUpdates, 1000);
    retryCallbackUntilSuccess(renderIgnoreLists, 1000);
})();
