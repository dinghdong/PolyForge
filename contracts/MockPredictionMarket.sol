// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title MockPredictionMarket — demo-grade parimutuel market for PolyForge
/// @notice Money rail is a plain ERC-20 `transfer` to this contract: that is
/// the only call shape an ERC-7715 token-periodic permission can redeem, so
/// agents bet by transferring USDC here and a trusted operator (the agent
/// backend) attributes received funds to bets. `attributed` accounting
/// guarantees an operator can never attribute more than was actually
/// received. Real-CLOB integration (Polymarket) is mainnet roadmap.
contract MockPredictionMarket {
    IERC20 public immutable usdc;
    address public owner;
    mapping(address => bool) public operators;

    struct Market {
        string question;
        string outcomeA;
        string outcomeB;
        uint64 closesAt;
        bool resolved;
        uint8 winner; // 0 = outcomeA, 1 = outcomeB
        uint128 poolA;
        uint128 poolB;
    }

    struct Bet {
        address bettor;
        uint64 marketId;
        uint8 outcome;
        bool claimed;
        uint128 amount;
    }

    Market[] public markets;
    Bet[] public bets;
    /// @dev USDC received and accounted for (recorded bets); recordBet may
    /// only consume balance above this watermark.
    uint256 public attributed;

    event MarketCreated(uint256 indexed marketId, string question, uint64 closesAt);
    event BetRecorded(uint256 indexed betId, uint256 indexed marketId, address indexed bettor, uint8 outcome, uint256 amount);
    event MarketResolved(uint256 indexed marketId, uint8 winner);
    event Claimed(uint256 indexed betId, address indexed bettor, uint256 payout);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner, "not operator");
        _;
    }

    constructor(IERC20 _usdc, address[] memory initialOperators) {
        usdc = _usdc;
        owner = msg.sender;
        for (uint256 i = 0; i < initialOperators.length; i++) {
            operators[initialOperators[i]] = true;
        }
    }

    function setOperator(address op, bool enabled) external onlyOwner {
        operators[op] = enabled;
    }

    function createMarket(
        string calldata question,
        string calldata outcomeA,
        string calldata outcomeB,
        uint64 closesAt
    ) external onlyOperator returns (uint256 marketId) {
        markets.push(Market(question, outcomeA, outcomeB, closesAt, false, 0, 0, 0));
        marketId = markets.length - 1;
        emit MarketCreated(marketId, question, closesAt);
    }

    /// @notice Attribute USDC already transferred to this contract to a bet.
    function recordBet(
        address bettor,
        uint64 marketId,
        uint8 outcome,
        uint128 amount
    ) external onlyOperator returns (uint256 betId) {
        Market storage m = markets[marketId];
        require(!m.resolved && block.timestamp < m.closesAt, "market closed");
        require(outcome < 2, "bad outcome");
        require(amount > 0, "zero amount");
        require(usdc.balanceOf(address(this)) >= attributed + amount, "funds not received");

        attributed += amount;
        if (outcome == 0) m.poolA += amount;
        else m.poolB += amount;

        bets.push(Bet(bettor, marketId, outcome, false, amount));
        betId = bets.length - 1;
        emit BetRecorded(betId, marketId, bettor, outcome, amount);
    }

    function resolve(uint64 marketId, uint8 winner) external onlyOperator {
        Market storage m = markets[marketId];
        require(!m.resolved, "already resolved");
        require(winner < 2, "bad outcome");
        m.resolved = true;
        m.winner = winner;
        emit MarketResolved(marketId, winner);
    }

    /// @notice Parimutuel claim: winning bet takes its share of both pools.
    function claim(uint256 betId) external {
        Bet storage bet = bets[betId];
        Market storage m = markets[bet.marketId];
        require(m.resolved, "not resolved");
        require(!bet.claimed, "claimed");
        require(bet.outcome == m.winner, "lost");

        bet.claimed = true;
        uint256 winnerPool = m.winner == 0 ? m.poolA : m.poolB;
        uint256 totalPool = uint256(m.poolA) + uint256(m.poolB);
        uint256 payout = (uint256(bet.amount) * totalPool) / winnerPool;

        uint256 release = payout > attributed ? attributed : payout;
        attributed -= release;

        require(usdc.transfer(bet.bettor, payout), "transfer failed");
        emit Claimed(betId, bet.bettor, payout);
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function betCount() external view returns (uint256) {
        return bets.length;
    }
}
