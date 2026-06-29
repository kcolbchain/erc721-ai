// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ERC721AIx402Metering.sol";
import "./mocks/MockUSDC.sol";
import "./mocks/RevertingUSDC.sol";

contract ERC721AIx402MeteringTest is Test {
    ERC721AIx402Metering internal metering;
    MockUSDC internal usdc;

    address internal admin;
    address internal feeRecipient;
    address internal modelOwner;
    address internal caller;
    address internal stranger;

    uint16 internal constant FEE_BPS = 250; // 2.5%
    uint256 internal constant TOKEN_ID = 42;
    uint128 internal constant PRICE = 1_000_000; // 1 USDC (6 decimals)

    event ModelRegistered(uint256 indexed tokenId, address indexed owner, uint128 price);
    event InferencePriceUpdated(uint256 indexed tokenId, uint128 oldPrice, uint128 newPrice);
    event InferencePaid(uint256 indexed tokenId, address indexed caller, uint128 amount, uint256 inferenceCount);
    event RevenueWithdrawn(address indexed owner, uint256 amount);
    event ProtocolFeeUpdated(uint16 oldBps, uint16 newBps);

    function setUp() public {
        admin = makeAddr("admin");
        feeRecipient = makeAddr("feeRecipient");
        modelOwner = makeAddr("modelOwner");
        caller = makeAddr("caller");
        stranger = makeAddr("stranger");

        usdc = new MockUSDC();
        metering = new ERC721AIx402Metering(address(usdc), admin, feeRecipient, FEE_BPS);

        // Fund and approve the inference caller generously.
        usdc.mint(caller, 1_000_000_000); // 1,000 USDC
        vm.prank(caller);
        usdc.approve(address(metering), type(uint256).max);
    }

    function _register() internal {
        vm.prank(modelOwner);
        metering.registerModel(TOKEN_ID, PRICE);
    }

    // ── Constructor ─────────────────────────────────────────────────────

    function test_ConstructorStoresConfig() public view {
        assertEq(address(metering.usdc()), address(usdc));
        assertEq(metering.admin(), admin);
        assertEq(metering.protocolFeeRecipient(), feeRecipient);
        assertEq(metering.protocolFeeBps(), FEE_BPS);
    }

    function test_RevertWhenConstructorFeeTooHigh() public {
        vm.expectRevert(ERC721AIx402Metering.FeeTooHigh.selector);
        new ERC721AIx402Metering(address(usdc), admin, feeRecipient, 1001);
    }

    function test_ConstructorAcceptsMaxFee() public {
        ERC721AIx402Metering m = new ERC721AIx402Metering(address(usdc), admin, feeRecipient, 1000);
        assertEq(m.protocolFeeBps(), 1000);
    }

    // ── Registration ────────────────────────────────────────────────────

    function test_RegisterModelStoresOwnerAndPrice() public {
        vm.expectEmit(true, true, false, true);
        emit ModelRegistered(TOKEN_ID, modelOwner, PRICE);
        _register();

        (address owner, uint128 price, bool active, uint256 inferences) = metering.getModelInfo(TOKEN_ID);
        assertEq(owner, modelOwner);
        assertEq(price, PRICE);
        assertTrue(active);
        assertEq(inferences, 0);
    }

    function test_RevertWhenRegisterDuplicate() public {
        _register();
        vm.prank(modelOwner);
        vm.expectRevert(ERC721AIx402Metering.ModelAlreadyRegistered.selector);
        metering.registerModel(TOKEN_ID, PRICE);
    }

    function test_RevertWhenRegisterDuplicateByDifferentOwner() public {
        _register();
        vm.prank(stranger);
        vm.expectRevert(ERC721AIx402Metering.ModelAlreadyRegistered.selector);
        metering.registerModel(TOKEN_ID, PRICE);
    }

    function test_RevertWhenRegisterZeroPrice() public {
        vm.prank(modelOwner);
        vm.expectRevert(ERC721AIx402Metering.ZeroPrice.selector);
        metering.registerModel(TOKEN_ID, 0);
    }

    // ── Price mutation ──────────────────────────────────────────────────

    function test_OwnerCanUpdatePrice() public {
        _register();
        uint128 newPrice = 2_000_000;
        vm.expectEmit(true, false, false, true);
        emit InferencePriceUpdated(TOKEN_ID, PRICE, newPrice);
        vm.prank(modelOwner);
        metering.setInferencePrice(TOKEN_ID, newPrice);
        assertEq(metering.getInferencePrice(TOKEN_ID), newPrice);
    }

    function test_RevertWhenNonOwnerUpdatesPrice() public {
        _register();
        vm.prank(stranger);
        vm.expectRevert(ERC721AIx402Metering.NotModelOwner.selector);
        metering.setInferencePrice(TOKEN_ID, 2_000_000);
    }

    function test_RevertWhenUpdatePriceToZero() public {
        _register();
        vm.prank(modelOwner);
        vm.expectRevert(ERC721AIx402Metering.ZeroPrice.selector);
        metering.setInferencePrice(TOKEN_ID, 0);
    }

    function test_RevertWhenSetPriceOnUnregisteredModel() public {
        // owner of an unregistered model is address(0); msg.sender never matches.
        vm.prank(modelOwner);
        vm.expectRevert(ERC721AIx402Metering.NotModelOwner.selector);
        metering.setInferencePrice(999, PRICE);
    }

    // ── Active toggle ───────────────────────────────────────────────────

    function test_OwnerCanDeactivateAndReactivate() public {
        _register();
        vm.prank(modelOwner);
        metering.setModelActive(TOKEN_ID, false);
        (,, bool active,) = metering.getModelInfo(TOKEN_ID);
        assertFalse(active);

        vm.prank(modelOwner);
        metering.setModelActive(TOKEN_ID, true);
        (,, active,) = metering.getModelInfo(TOKEN_ID);
        assertTrue(active);
    }

    function test_RevertWhenNonOwnerTogglesActive() public {
        _register();
        vm.prank(stranger);
        vm.expectRevert(ERC721AIx402Metering.NotModelOwner.selector);
        metering.setModelActive(TOKEN_ID, false);
    }

    // ── Pay / settle: single ────────────────────────────────────────────

    function test_PayForInferenceSplitsRevenue() public {
        _register();

        uint128 expectedFee = uint128(uint256(PRICE) * FEE_BPS / 10000); // 25,000
        uint128 expectedOwnerShare = PRICE - expectedFee; // 975,000

        vm.expectEmit(true, true, false, true);
        emit InferencePaid(TOKEN_ID, caller, PRICE, 1);
        vm.prank(caller);
        metering.payForInference(TOKEN_ID);

        assertEq(metering.revenueBalance(modelOwner), expectedOwnerShare);
        assertEq(metering.revenueBalance(feeRecipient), expectedFee);
        assertEq(metering.totalInferences(TOKEN_ID), 1);
        // Contract custody equals total collected until withdrawal.
        assertEq(usdc.balanceOf(address(metering)), PRICE);
    }

    function test_PayForInferenceAccumulatesAcrossCalls() public {
        _register();
        vm.startPrank(caller);
        metering.payForInference(TOKEN_ID);
        metering.payForInference(TOKEN_ID);
        metering.payForInference(TOKEN_ID);
        vm.stopPrank();

        uint128 fee = uint128(uint256(PRICE) * FEE_BPS / 10000);
        assertEq(metering.totalInferences(TOKEN_ID), 3);
        assertEq(metering.revenueBalance(modelOwner), uint256(PRICE - fee) * 3);
        assertEq(metering.revenueBalance(feeRecipient), uint256(fee) * 3);
    }

    function test_RevertWhenPayInactiveModel() public {
        _register();
        vm.prank(modelOwner);
        metering.setModelActive(TOKEN_ID, false);

        vm.prank(caller);
        vm.expectRevert(ERC721AIx402Metering.ModelNotActive.selector);
        metering.payForInference(TOKEN_ID);
    }

    function test_RevertWhenPayUnregisteredModel() public {
        // Unregistered model defaults to active == false.
        vm.prank(caller);
        vm.expectRevert(ERC721AIx402Metering.ModelNotActive.selector);
        metering.payForInference(123456);
    }

    function test_RevertWhenCallerHasNotApproved() public {
        _register();
        address poor = makeAddr("poor");
        usdc.mint(poor, PRICE);
        // No approval granted.
        vm.prank(poor);
        vm.expectRevert();
        metering.payForInference(TOKEN_ID);
    }

    function test_RevertWhenCallerHasInsufficientBalance() public {
        _register();
        address broke = makeAddr("broke");
        vm.prank(broke);
        usdc.approve(address(metering), type(uint256).max);
        vm.prank(broke);
        vm.expectRevert();
        metering.payForInference(TOKEN_ID);
    }

    function test_NoFeeWhenZeroFeeBps() public {
        ERC721AIx402Metering m = new ERC721AIx402Metering(address(usdc), admin, feeRecipient, 0);
        vm.prank(modelOwner);
        m.registerModel(TOKEN_ID, PRICE);

        vm.prank(caller);
        usdc.approve(address(m), type(uint256).max);
        vm.prank(caller);
        m.payForInference(TOKEN_ID);

        assertEq(m.revenueBalance(modelOwner), PRICE);
        assertEq(m.revenueBalance(feeRecipient), 0);
    }

    // ── Pay / settle: batch ─────────────────────────────────────────────

    function test_PayForInferencesBatchSplitsRevenue() public {
        _register();
        uint256 count = 10;

        uint256 totalPrice = uint256(PRICE) * count;
        uint256 fee = totalPrice * FEE_BPS / 10000;
        uint256 ownerShare = totalPrice - fee;

        vm.expectEmit(true, true, false, true);
        emit InferencePaid(TOKEN_ID, caller, uint128(totalPrice), count);
        vm.prank(caller);
        metering.payForInferences(TOKEN_ID, count);

        assertEq(metering.totalInferences(TOKEN_ID), count);
        assertEq(metering.revenueBalance(modelOwner), ownerShare);
        assertEq(metering.revenueBalance(feeRecipient), fee);
        assertEq(usdc.balanceOf(address(metering)), totalPrice);
    }

    function test_RevertWhenBatchPayInactiveModel() public {
        _register();
        vm.prank(modelOwner);
        metering.setModelActive(TOKEN_ID, false);
        vm.prank(caller);
        vm.expectRevert(ERC721AIx402Metering.ModelNotActive.selector);
        metering.payForInferences(TOKEN_ID, 5);
    }

    function test_BatchOfZeroChargesNothingButCountsZero() public {
        _register();
        vm.prank(caller);
        metering.payForInferences(TOKEN_ID, 0);
        assertEq(metering.totalInferences(TOKEN_ID), 0);
        assertEq(metering.revenueBalance(modelOwner), 0);
        assertEq(usdc.balanceOf(address(metering)), 0);
    }

    function test_SingleAndBatchProduceConsistentAccounting() public {
        _register();
        // 5 singles
        vm.startPrank(caller);
        for (uint256 i = 0; i < 5; i++) {
            metering.payForInference(TOKEN_ID);
        }
        // then a batch of 5
        metering.payForInferences(TOKEN_ID, 5);
        vm.stopPrank();

        assertEq(metering.totalInferences(TOKEN_ID), 10);
        // Per-unit fee on single = floor(PRICE*bps/10000); batch fee computed on the sum.
        // For PRICE divisible such that there is no rounding, the two must add up exactly.
        uint256 singleFeeEach = uint256(PRICE) * FEE_BPS / 10000;
        uint256 batchFee = (uint256(PRICE) * 5) * FEE_BPS / 10000;
        uint256 expectedFee = singleFeeEach * 5 + batchFee;
        assertEq(metering.revenueBalance(feeRecipient), expectedFee);
        assertEq(metering.revenueBalance(modelOwner), uint256(PRICE) * 10 - expectedFee);
    }

    // ── Withdrawals ─────────────────────────────────────────────────────

    function test_WithdrawTransfersAndResets() public {
        _register();
        vm.prank(caller);
        metering.payForInference(TOKEN_ID);

        uint128 fee = uint128(uint256(PRICE) * FEE_BPS / 10000);
        uint256 ownerShare = PRICE - fee;

        vm.expectEmit(true, false, false, true);
        emit RevenueWithdrawn(modelOwner, ownerShare);
        vm.prank(modelOwner);
        metering.withdrawRevenue();

        assertEq(usdc.balanceOf(modelOwner), ownerShare);
        assertEq(metering.revenueBalance(modelOwner), 0);
        // Fee recipient share remains in custody.
        assertEq(usdc.balanceOf(address(metering)), fee);
    }

    function test_FeeRecipientCanWithdraw() public {
        _register();
        vm.prank(caller);
        metering.payForInference(TOKEN_ID);

        uint128 fee = uint128(uint256(PRICE) * FEE_BPS / 10000);
        vm.prank(feeRecipient);
        metering.withdrawRevenue();
        assertEq(usdc.balanceOf(feeRecipient), fee);
        assertEq(metering.revenueBalance(feeRecipient), 0);
    }

    function test_WithdrawWithZeroBalanceIsNoOp() public {
        // No revert, no transfer, no event side effects.
        uint256 before = usdc.balanceOf(stranger);
        vm.prank(stranger);
        metering.withdrawRevenue();
        assertEq(usdc.balanceOf(stranger), before);
    }

    function test_DoubleWithdrawDrainsOnce() public {
        _register();
        vm.prank(caller);
        metering.payForInference(TOKEN_ID);

        uint256 ownerShare = PRICE - uint256(PRICE) * FEE_BPS / 10000;
        vm.prank(modelOwner);
        metering.withdrawRevenue();
        // Second withdraw is a no-op.
        vm.prank(modelOwner);
        metering.withdrawRevenue();
        assertEq(usdc.balanceOf(modelOwner), ownerShare);
    }

    function test_SettlementFailurePropagates() public {
        // Use a token whose transferFrom can be forced to fail; SafeERC20 must revert,
        // so no revenue is credited and no inference is counted.
        RevertingUSDC bad = new RevertingUSDC();
        ERC721AIx402Metering m = new ERC721AIx402Metering(address(bad), admin, feeRecipient, FEE_BPS);
        vm.prank(modelOwner);
        m.registerModel(TOKEN_ID, PRICE);

        bad.mint(caller, PRICE);
        vm.prank(caller);
        bad.approve(address(m), type(uint256).max);
        bad.setFailTransfers(true);

        vm.prank(caller);
        vm.expectRevert(); // SafeERC20: SafeERC20FailedOperation
        m.payForInference(TOKEN_ID);

        assertEq(m.totalInferences(TOKEN_ID), 0);
        assertEq(m.revenueBalance(modelOwner), 0);
    }

    // ── Admin: protocol fee ─────────────────────────────────────────────

    function test_AdminCanUpdateFee() public {
        vm.expectEmit(false, false, false, true);
        emit ProtocolFeeUpdated(FEE_BPS, 500);
        vm.prank(admin);
        metering.setProtocolFee(500);
        assertEq(metering.protocolFeeBps(), 500);
    }

    function test_RevertWhenNonAdminUpdatesFee() public {
        vm.prank(stranger);
        vm.expectRevert(ERC721AIx402Metering.NotModelOwner.selector); // contract reuses this error for admin gate
        metering.setProtocolFee(500);
    }

    function test_RevertWhenAdminSetsFeeTooHigh() public {
        vm.prank(admin);
        vm.expectRevert(ERC721AIx402Metering.FeeTooHigh.selector);
        metering.setProtocolFee(1001);
    }

    function test_FeeUpdateAffectsSubsequentPayments() public {
        _register();
        vm.prank(admin);
        metering.setProtocolFee(1000); // 10%

        vm.prank(caller);
        metering.payForInference(TOKEN_ID);

        uint256 fee = uint256(PRICE) * 1000 / 10000;
        assertEq(metering.revenueBalance(feeRecipient), fee);
        assertEq(metering.revenueBalance(modelOwner), PRICE - fee);
    }

    // ── Fuzz: fee-split invariants ──────────────────────────────────────

    function testFuzz_FeeSplitConservesValue(uint128 price, uint16 feeBps) public {
        price = uint128(bound(price, 1, type(uint96).max)); // keep custody well within balance
        feeBps = uint16(bound(feeBps, 0, 1000));

        ERC721AIx402Metering m = new ERC721AIx402Metering(address(usdc), admin, feeRecipient, feeBps);
        vm.prank(modelOwner);
        m.registerModel(TOKEN_ID, price);

        usdc.mint(caller, price);
        vm.prank(caller);
        usdc.approve(address(m), type(uint256).max);
        vm.prank(caller);
        m.payForInference(TOKEN_ID);

        uint256 ownerBal = m.revenueBalance(modelOwner);
        uint256 feeBal = m.revenueBalance(feeRecipient);
        // No value is created or destroyed: owner + fee == price exactly.
        assertEq(ownerBal + feeBal, price);
        // Fee never exceeds the configured ceiling.
        assertLe(feeBal, uint256(price) * feeBps / 10000);
    }

    function testFuzz_BatchAccounting(uint128 price, uint8 count) public {
        price = uint128(bound(price, 1, 1e15));
        uint256 c = bound(count, 1, 100);

        ERC721AIx402Metering m = new ERC721AIx402Metering(address(usdc), admin, feeRecipient, FEE_BPS);
        vm.prank(modelOwner);
        m.registerModel(TOKEN_ID, price);

        uint256 total = uint256(price) * c;
        usdc.mint(caller, total);
        vm.prank(caller);
        usdc.approve(address(m), type(uint256).max);
        vm.prank(caller);
        m.payForInferences(TOKEN_ID, c);

        assertEq(m.totalInferences(TOKEN_ID), c);
        assertEq(m.revenueBalance(modelOwner) + m.revenueBalance(feeRecipient), total);
        assertEq(usdc.balanceOf(address(m)), total);
    }
}
