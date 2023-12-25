/*
 *   Copyright (c) 2023 Alexey Vinogradov
 *   All rights reserved.

 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 */

function getCache(cacheName, fn, actualTime) {
    return new Promise((resolve, reject) => {
        actualTime = actualTime ?? 0;
        if (typeof fn !== 'function')
            return reject('Не передана функция получения данных');

        var currentData = JSON.parse(localStorage.getItem(cacheName));
        var cDate = new Date();
        if (!currentData || currentData.data == null || actualTime == 0 || (cDate - currentData.t) / 1000 > actualTime) {
            var result = fn();
            if (typeof result !== 'function')
                result = new Promise((res, rej) => res(result));

            return result.then(data => {
                localStorage.setItem(cacheName, JSON.stringify({ t: cDate, data }));
                return resolve(data);
            }, err => reject(err));
        }
        return resolve(currentData.data);
    });
}

class XeggexApi {
    apiUrl = "https://api.xeggex.com/api/v2";
    constructor(secretHash) { this.secretHash = secretHash; }
    pairs() {
        return getCache("api.summary"
            , () => $.get(this.apiUrl + "/summary").then(pairs => $.map(pairs, pair => pair.trading_pairs).sort())
            , 60 * 5);
    }
    balances() {
        return $.get({
            url: this.apiUrl + "/balances",
            headers: { 'Authorization': "Basic " + this.secretHash }
        });
    }
    createorder(assetPair, available) {
        return $.post({
            url: this.apiUrl + "/createorder",
            data: {
                symbol: assetPair,
                side: "sell",
                quantity: available,
                type: "market",
                strictValidate: false
            },
            headers: { 'Authorization': "Basic " + this.secretHash }
        });
    }
}

window.addEventListener("load", async () => {
    /*привязка кнопок*/
    $('#connect input[type="submit"]').on('click', () => {
        var apiKey = $('input[name="apiKey"]').val();
        var apiSecred = $('input[name="apiSecred"]').val();
        if (apiKey != "" && apiSecred != "") {
            var hash = btoa(apiKey + ":" + apiSecred);
            var testConnect = new XeggexApi(hash);
            testConnect.balances().then(
                () => getCache("hashConnect", () => hash, 1).then(() => location.reload())
                , () => { $('#connect .error').html("Данные не действительны для API подключения"); }
            );
        }
        else $('#connect .error').html("Поля обязательны для заполнения");
    });

    $("#exchangeSection button").on('click', () => {
        window.xeggex.pairs().then(function (pairs) {
            window.xeggex.balances().done(function (balances) {
                var nonConvert = ['XPE', 'ZEPH'];
                var convertTo = ['USDT', 'BNB', 'DOGE', 'USDC', 'BTC'];
                var needTradeBalances = $.grep(balances, balance => balance.available > 0 && !nonConvert.concat(convertTo).includes(balance.asset));
                var trades = $.map(needTradeBalances, function (balance) {
                    var tradePair = $.map(convertTo, el => balance.asset + "_" + el);
                    return {
                        asset: balance.asset,
                        available: balance.available,
                        pairs: $.grep(tradePair, pair => pairs.includes(pair))
                    };
                });
                trades = $.grep(trades, el => el.pairs.length > 0);
                $('#debug').html("<div>Trade elements: " + trades.length + "</div><br>");

                var tradeAssetFunction = function (asset, pairs, available) {
                    if (pairs.length === 0)
                        return false;

                    return window.xeggex
                        .createorder(pairs[0], available)
                        .done(data => {
                            $('#debug').append("<div style='color:green'>Pair " + pairs[0] + " converted.</div>");
                            return true;
                        })
                        .fail(data => {
                            console.log(data);
                            $('#debug').append("<div style='color:red'>Pair " + pairs[0] + ": " + data.statusText + "</div>");
                            return tradeAssetFunction(asset, pairs.slice(1), available);
                        });
                };
                var tradeFunction = function (availableTrades) {
                    if (availableTrades.length === 0)
                        return;
                    var currentTrade = availableTrades[0];
                    return tradeAssetFunction(currentTrade.asset, currentTrade.pairs, currentTrade.available)
                        .done(data => tradeFunction(availableTrades.slice(1)))
                        .fail(data => tradeFunction(availableTrades.slice(1)));
                };
                tradeFunction(trades).then(() => $('#debug').append("<br>Done."));
            });
        });
    });

    /*обмен*/
    getCache("hashConnect", () => { throw 'нет ключа' }, 60 * 60 * 24 * 365 * 10)
        .then(secretHash => {
            window.xeggex = new XeggexApi(secretHash);
            $("#exchangeSection").show();
        }, error => { console.log(error); $("#connect").show(); });
});