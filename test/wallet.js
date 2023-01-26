const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const chai = require('chai');
const { expect } = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const Wallet = artifacts.require('Wallet');
const DCallable = artifacts.require('DCallable');
const DRevertable = artifacts.require('DRevertable');
const Callable = artifacts.require('Callable');
const Revertable = artifacts.require('Revertable');
const Voting = artifacts.require('Voting');

function amount18(n) {
    return new BN(web3.utils.toWei(n, 'ether'));
}

contract('Wallet', async ([account1, account2, account3, account4]) => {
    describe('Nde', () => {
        it('Should construct', async () => {
            await Wallet.new([account1, account2, account3], 1);
            await Wallet.new([account1, account2, account3], 2);
            await Wallet.new([account1, account2, account3], 3);
            await expectRevert(Wallet.new([account1, account2, account3], 0), 'zero threshold');
            await expectRevert(Wallet.new([account1, account2, account3], 4), 'too large threshold');
        });

        it('Should create proposal', async () => {
            let wallet = await Wallet.new([account1, account2, account3], 2);
            await wallet.proposeDCall(account4, 0, {from: account1});
            expect(((await wallet.last())[1]).toString()).to.equals(account1);
            await wallet.proposeDCall(account4, 0, {from: account2});
            expect(((await wallet.last())[1]).toString()).to.equals(account2);
            await wallet.proposeDCall(account4, 0, {from: account3});
            expect(((await wallet.last())[1]).toString()).to.equals(account3);
            await wallet.proposeCall(account4, 0, 0, [], {from: account1});
            await expectRevert(wallet.proposeDCall(account4, 0, {from: account4}), 'not a voter or already voted');
            await expectRevert(wallet.proposeCall(account4, 0, 0, [], {from: account4}), 'not a voter or already voted');
        });

        it('Should resolve proposal', async () => {
            let callable = await DCallable.new();
            let wallet = await Wallet.new([account1, account2, account3], 2);
            await wallet.proposeDCall(callable.address, 100000, {from: account1});
            let voting = await Voting.at((await wallet.last())[0]);
            await expectRevert(voting.approve({from: account1}), 'not a voter or already voted');
            await expectRevert(voting.finalize({from: account1}), 'voting not resolved');
            voting.approve({from: account2});
            await expectRevert(voting.approve({from: account2}), 'not a voter or already voted');
            voting.finalize.call({from: account2});
            voting.approve({from: account3});
            await expectRevert(voting.approve({from: account3}), 'not a voter or already voted');
            await expectRevert(voting.approve({from: account4}), 'not a voter or already voted');
            await voting.finalize({from: account3});
            await expectRevert(voting.finalize({from: account3}), 'already finalized');
            await expectRevert(voting.approve({from: account1}), 'already finalized');
            await expectRevert(voting.approve({from: account2}), 'already finalized');
            await expectRevert(voting.approve({from: account3}), 'already finalized');
        });

        it('Should revert proposal', async () => {
            let revertable = await DRevertable.new();
            let wallet = await Wallet.new([account1, account2, account3], 2);
            await wallet.proposeDCall(revertable.address, 100000, {from: account1});
            let voting = await Voting.at((await wallet.last())[0]);
            voting.approve({from: account2});
            await expectRevert(voting.finalize({from: account3, gas: 135000}), 'not enough gas');
            await expectRevert(voting.finalize({from: account3, gas: 150000}), 'not enough gas');
            await expectRevert(voting.finalize({from: account3, gas: 170000}), 'not enough gas');
            await voting.finalize({from: account3});
            await expectRevert(voting.finalize({from: account3}), 'already finalized');
            expect((await web3.eth.getBalance("0x0000000000000000000000000000000000000000")).toString()).to.equals('0');
        });

        it('Should allow incoming transfers', async () => {
            let wallet = await Wallet.new([account1, account2, account3], 2);
            await web3.eth.sendTransaction({from: account1, to: wallet.address, value: 1 });
        });

        it('Should execute delegatecall proposal', async () => {
            let callable = await DCallable.new();
            let wallet = await Wallet.new([account1, account2, account3], 2);
            await wallet.proposeDCall(callable.address, 100000, {from: account1});
            let voting = await Voting.at((await wallet.last())[0]);
            voting.approve({from: account2});
            await web3.eth.sendTransaction({from: account1, to: wallet.address, value: 1 });
            expect((await web3.eth.getBalance("0x0000000000000000000000000000000000000000")).toString()).to.equals('0');
            expect((await web3.eth.getBalance(wallet.address)).toString()).to.equals('1');
            await voting.finalize({from: account1});
            await expectRevert(voting.finalize({from: account3}), 'already finalized');
            expect((await web3.eth.getBalance("0x0000000000000000000000000000000000000000")).toString()).to.equals('1');
            expect((await web3.eth.getBalance(wallet.address)).toString()).to.equals('0');
        });

        it('Should execute call proposal', async () => {
            let callable = await Callable.new();
            let wallet = await Wallet.new([account1, account2, account3], 2);
            const calldata = '0xa52c101e0000000000000000000000000000000000000000000000000000000000000001' // means send(1)
            await wallet.proposeCall(callable.address, 100000, 2, calldata, {from: account1});
            let voting = await Voting.at((await wallet.last())[0]);
            voting.approve({from: account2});
            await web3.eth.sendTransaction({from: account1, to: wallet.address, value: 2 });
            expect((await web3.eth.getBalance("0x0000000000000000000000000000000000000000")).toString()).to.equals('1');
            expect((await web3.eth.getBalance(callable.address)).toString()).to.equals('0');
            expect((await web3.eth.getBalance(wallet.address)).toString()).to.equals('2');
            await voting.finalize({from: account1});
            await expectRevert(voting.finalize({from: account3}), 'already finalized');
            expect((await web3.eth.getBalance("0x0000000000000000000000000000000000000000")).toString()).to.equals('2');
            expect((await web3.eth.getBalance(callable.address)).toString()).to.equals('1');
            expect((await web3.eth.getBalance(wallet.address)).toString()).to.equals('0');
        });

        it('Should update voters list', async () => {
            let wallet = await Wallet.new([account1, account2, account3], 2);
            await expectRevert(wallet._update([account1], 1, {from: account1}), 'must be called by self');
            // means _update(account4, 1)
            const calldata = '0x1b1b0bb2000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000' + account4.substring(2);
            await wallet.proposeCall(wallet.address, 500000, 0, calldata, {from: account1});
            let voting = await Voting.at((await wallet.last())[0]);
            //console.log(await voting.data());
            voting.approve({from: account2});
            expect((await wallet.threshold.call()).toString()).to.equals('2');
            //await wallet.debug(wallet.address, 0, false, calldata, {from: account1});
            await voting.finalize({from: account1});
            await expectRevert(voting.finalize({from: account3}), 'already finalized');
            expect((await wallet.threshold.call()).toString()).to.equals('1');
            expect((await wallet.voters.call(0)).toString()).to.equals(account4);

            let callable = await DCallable.new();
            await wallet.proposeDCall(callable.address, 100000, {from: account4});
            voting = await Voting.at((await wallet.last())[0]);
            await expectRevert(voting.approve({from: account4}), 'not a voter or already voted');
            await expectRevert(voting.approve({from: account3}), 'not a voter or already voted');
            await expectRevert(voting.approve({from: account2}), 'not a voter or already voted');
            await expectRevert(voting.approve({from: account1}), 'not a voter or already voted');
            voting.finalize.call({from: account2});
        });
    });
});
