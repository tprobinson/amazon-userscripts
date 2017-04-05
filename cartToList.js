// ==UserScript==
// @name         Cart to List
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Moves your entire cart to a wishlist. Currently only works if you have one list.
// @author       Trevor Robinson  <tprobinson93@gmail.com>
// @include      /https:\/\/www.amazon.com\/[^\/]+\/cart.*/
// @grant        GM_registerMenuCommand
// ==/UserScript==

// eslint-disable-next-line
GM_registerMenuCommand('Move all Items in Cart to Wishlist', () => {
  const cartParentId = 'activeCartViewForm';
  const cartItemQuery = '.sc-list-item[data-asin]';
  const cartUpdateURL = '/gp/registry/huc/add-item-ajax.html';

  // Method of array conversion that performs the best
  const toArr = coll => {
    const result = [];
    coll.forEach(val => result.push(val));
    return result;
  };

  const hashToQuery = hash => Object.keys(hash)
    .map(key => key + '=' + encodeURIComponent(hash[key]))
    .join('&')
  ;

  const items = toArr(document.getElementById(cartParentId).querySelectorAll(cartItemQuery));

  const sessionId = document.querySelector('input[name=session-id]').value;

  // Create an iframe to load in wishlists... this is so terrible.
  const wishlistPane = document.createElement('iframe');
  wishlistPane.id = 'moveCartToWishlistFrame';
  wishlistPane.src = '/wishlist';
  wishlistPane.sandbox = 'allow-same-origin allow-scripts';
  const parseWishlists = () => {
    let wishlists;
    try {
      wishlists = JSON.parse(wishlistPane.contentDocument.querySelector('script[data-a-state=\'{"key":"regListState"}\']').innerHTML);
    } catch(e) {
      return Promise.reject('Error when getting wishlist data:', e);
    }

    let targetList;
    const lists = Object.keys(wishlists);
    if( lists.length > 1 ) {
      // Welp I dunno. Present an interface here later?
      return Promise.reject('User has multiple lists');
    } else if( lists.length === 1 ) {
      targetList = lists[0];
    } else {
      // Prompt the user to make a list?
      return Promise.reject('User has no lists');
    }

    if( !targetList ) {
      return Promise.reject('No target wishlist obtained.');
    }

    // Submit request to move each item to the wishlist.
    const postBodies = items.map(item => ({
      'session-id': sessionId,
      offerListingID: item.dataset.offeringListId,
      rsid: sessionId,
      url: cartUpdateURL + '?ie=UTF8',
      sid: sessionId,
      ASIN: item.dataset.asin,
      // ASIN: item.dataset.itemId, // what is this value, it's not always the same?
      quantity: item.dataset.quantity,
      action: 'add',
      type: 'wishlist',
      caller: 'aui',
      requestedQty: item.dataset.quantity,
      itemCount: item.dataset.itemCount
    }));

    const sendRequest = (postBody, tryCount = 0) => fetch(cartUpdateURL + '?' + hashToQuery(postBody), {credentials: 'same-origin'})
      // delay the results a little bit if we're retrying.
      .then(r => new Promise(resolve => tryCount > 0 ? setTimeout(() => resolve(r), 500 * tryCount) : resolve(r)) )
      .then(r => r.text())
      .then(text => {
        try {
          const obj = JSON.parse(text);
          if( obj.status === 'success' ) {
            return Promise.resolve(text);
          }

          if( tryCount < 3 ) {
            console.log('Retrying ' + postBody.ASIN);
            return sendRequest(postBody, tryCount + 1);
          }

          return Promise.reject('Query failed despite retries for ' + postBody.ASIN);
        } catch(e) {
          return Promise.reject('Query failed for ' + postBody.ASIN);
        }
      })
    ;

    return Promise.all(postBodies.map(x => sendRequest(x)));
  };

  wishlistPane.onload = () => parseWishlists().then(results => {
    console.log(results);
    document.body.removeChild(wishlistPane);
  }).catch(e => {
    console.error(e);
    document.body.removeChild(wishlistPane);
  });

  console.warn('From Cart to List: You may ignore the following error about an unsafe JavaScript attempt to initiate navigation for frames.');
  document.body.appendChild(wishlistPane);
}, 'c');
