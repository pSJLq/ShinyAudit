// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ShinyAuditEscrow
 * @notice Pre-funded credit + billing for the {s}hinyAudit agent swarm on Somnia.
 *
 * Flow:
 *   1. User calls `deposit()` once with msg.value → credit accumulates.
 *   2. Orchestrator (server-side EOA) calls `dispatchFor(user, agentId, payload, agentDeposit)`
 *      per agent step. Contract checks user has at least `agentDeposit * 1.5` credit,
 *      forwards `agentDeposit` to Somnia's SomniaAgents platform via createRequest,
 *      keeps the 50% surplus as platform revenue.
 *   3. Refunds from Somnia (unused subcommittee budget) hit this contract via
 *      `receive()` and are pooled with platform revenue.
 *   4. Owner calls `withdraw()` (or `withdrawTo(addr, amount)`) to drain accumulated
 *      revenue + Somnia refunds to a treasury address.
 *   5. User can `refund()` their remaining credit at any time.
 *
 * Security:
 *   - Owner is set at deploy and may transfer via `transferOwnership`.
 *   - Only the orchestrator EOA can spend user credit (limits abuse if a user wallet leaks).
 *   - `dispatchFor` is non-reentrant; Somnia's platform is trusted (audited official contract).
 */

interface ISomniaAgents {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function getRequestDeposit() external view returns (uint256);
}

contract ShinyAuditEscrow {
    /// @dev 50% service fee, in basis points (10_000 = 100%).
    uint256 public constant SERVICE_FEE_BPS = 5_000;
    uint256 public constant BPS_DENOM = 10_000;

    address public owner;
    address public orchestrator;
    ISomniaAgents public immutable platform;

    /// @dev user → credit balance held in the contract (in native wei, e.g. STT-wei)
    mapping(address => uint256) public credits;

    /// @dev total credit owed to users (so we never withdraw user funds by mistake)
    uint256 public totalUserCredits;

    /// @dev cumulative service-fee revenue earned by the platform
    uint256 public revenueEarned;

    /// @dev cumulative service-fee revenue withdrawn by owner
    uint256 public revenueWithdrawn;

    // ----- events -----
    event Deposited(address indexed user, uint256 amount, uint256 newCredit);
    event Refunded(address indexed user, uint256 amount);
    event Dispatched(
        address indexed user,
        uint256 indexed somniaRequestId,
        uint256 agentDeposit,
        uint256 serviceFee
    );
    event Withdrawn(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OrchestratorChanged(address indexed previousOrchestrator, address indexed newOrchestrator);

    // ----- errors -----
    error NotOwner();
    error NotOrchestrator();
    error ZeroAddress();
    error ZeroValue();
    error InsufficientCredit(address user, uint256 required, uint256 available);
    error InsufficientFunds(uint256 required, uint256 available);
    error TransferFailed();
    error Reentrancy();

    // ----- reentrancy guard -----
    uint256 private _locked = 1;
    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOrchestrator() {
        if (msg.sender != orchestrator) revert NotOrchestrator();
        _;
    }

    constructor(address _platform, address _orchestrator) {
        if (_platform == address(0) || _orchestrator == address(0)) revert ZeroAddress();
        owner = msg.sender;
        orchestrator = _orchestrator;
        platform = ISomniaAgents(_platform);
        emit OwnershipTransferred(address(0), msg.sender);
        emit OrchestratorChanged(address(0), _orchestrator);
    }

    // ============================================================
    //                          QUOTING
    // ============================================================

    /// @notice How much the user must have in credit to dispatch a step costing `agentDeposit`.
    function quote(uint256 agentDeposit) public pure returns (uint256 total, uint256 fee) {
        fee = (agentDeposit * SERVICE_FEE_BPS) / BPS_DENOM;
        total = agentDeposit + fee;
    }

    // ============================================================
    //                          USER PATH
    // ============================================================

    /// @notice Top up your credit. The orchestrator can dispatch agents on your behalf
    ///         until your credit runs out.
    function deposit() external payable {
        if (msg.value == 0) revert ZeroValue();
        credits[msg.sender] += msg.value;
        totalUserCredits += msg.value;
        emit Deposited(msg.sender, msg.value, credits[msg.sender]);
    }

    /// @notice Withdraw any unused credit back to the caller's wallet.
    function refund() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert ZeroValue();
        credits[msg.sender] = 0;
        totalUserCredits -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Refunded(msg.sender, amount);
    }

    /// @notice User can withdraw a partial amount.
    function refundPartial(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroValue();
        if (credits[msg.sender] < amount) {
            revert InsufficientCredit(msg.sender, amount, credits[msg.sender]);
        }
        credits[msg.sender] -= amount;
        totalUserCredits -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Refunded(msg.sender, amount);
    }

    // ============================================================
    //                       ORCHESTRATOR PATH
    // ============================================================

    /**
     * @notice Spend `agentDeposit + serviceFee` of `user`'s credit, forward
     *         `agentDeposit` to Somnia's agent platform, retain `serviceFee` as revenue.
     */
    function dispatchFor(
        address user,
        uint256 agentId,
        bytes calldata payload,
        uint256 agentDeposit
    ) external onlyOrchestrator nonReentrant returns (uint256 somniaRequestId) {
        (uint256 total, uint256 fee) = quote(agentDeposit);
        if (credits[user] < total) revert InsufficientCredit(user, total, credits[user]);
        if (address(this).balance < agentDeposit) revert InsufficientFunds(agentDeposit, address(this).balance);

        credits[user] -= total;
        totalUserCredits -= total;
        revenueEarned += fee;

        somniaRequestId = platform.createRequest{value: agentDeposit}(
            agentId,
            address(this),    // refunds come back here via receive()
            0x00000000,
            payload
        );

        emit Dispatched(user, somniaRequestId, agentDeposit, fee);
    }

    // ============================================================
    //                          OWNER PATH
    // ============================================================

    /// @notice Net revenue available to withdraw (excludes user-owed credits).
    function withdrawableRevenue() public view returns (uint256) {
        uint256 bal = address(this).balance;
        // Anything above totalUserCredits belongs to the platform (revenue + refunds from Somnia).
        if (bal <= totalUserCredits) return 0;
        return bal - totalUserCredits;
    }

    /// @notice Drain all platform-owned funds to the owner.
    function withdraw() external onlyOwner nonReentrant {
        uint256 amount = withdrawableRevenue();
        if (amount == 0) revert ZeroValue();
        revenueWithdrawn += amount;
        (bool ok, ) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(owner, amount);
    }

    /// @notice Withdraw a specific amount to a specific address.
    function withdrawTo(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroValue();
        uint256 available = withdrawableRevenue();
        if (amount > available) revert InsufficientFunds(amount, available);
        revenueWithdrawn += amount;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setOrchestrator(address newOrchestrator) external onlyOwner {
        if (newOrchestrator == address(0)) revert ZeroAddress();
        emit OrchestratorChanged(orchestrator, newOrchestrator);
        orchestrator = newOrchestrator;
    }

    // ============================================================
    //                      RECEIVE / FALLBACK
    // ============================================================

    /// @dev Accept native refunds from Somnia (unused subcommittee budget on finalize).
    receive() external payable {}
}
