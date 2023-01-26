pragma solidity ^0.5.0;

contract Voting {
    // Call parameters (voting subject)
    address public target;
    uint256 public gas;
    uint256 public amount;
    bool public delegateCall;
    bytes public data;

    // Voters
    mapping(address => bool) public notVoted;
    uint256 public votesLeft;

    // Wallet
    address internal wallet;

    constructor(address[] memory _voters, address _creator, uint256 _threshold, address _target, uint256 _gas, uint256 _amount, bool _delegateCall, bytes memory _data) public {
        require(gas < 9000000, "too large gas limit");
        wallet = msg.sender;
        votesLeft = _threshold;
        for (uint256 i = 0; i < _voters.length; i++) {
            notVoted[_voters[i]] = true;
        }

        target = _target;
        gas = _gas;
        amount = _amount;
        delegateCall = _delegateCall;
        data = _data;


        _approve(_creator);
    }

    function approve() external {
        _approve(msg.sender);
    }

    event Approved(address indexed by);

    function _approve(address by) internal {
        require(wallet != address(0), "already finalized");
        require(notVoted[by], "not a voter or already voted");
        delete notVoted[by];
        if (votesLeft > 0) {
            votesLeft--;
        }
        emit Approved(by);
    }

    function finalize() external {
        require(wallet != address(0), "already finalized");
        require(votesLeft == 0, "voting not resolved");
        address payable w = address(uint160(wallet));
        wallet = address(0);
        // It's important that we call after erasing (protection against Re-Entrancy)
        Wallet(w)._execute(target, gas, amount, delegateCall, data);
    }
}

contract Wallet {
    // Voters
    address[] public voters;
    uint256 public threshold;

    // Active proposals
    mapping(address => bool) public isActive;

    // allow incoming FTM transfers
    function() payable external {
        require(msg.data.length == 0 && msg.value > 0, "not FTM transfer");
    }

    constructor(address[] memory _voters, uint256 _threshold) public {
        _setVoters(_voters, _threshold);
    }

    // _update is supposed to be called by itself during a proposal execution
    function _update(address[] calldata _voters, uint256 _threshold) external {
        require(msg.sender == address(this), "must be called by self");
        _setVoters(_voters, _threshold);
    }

    function _setVoters(address[] memory _voters, uint256 _threshold) internal {
        require(_threshold > 0, "zero threshold");
        require(_threshold <= _voters.length, "too large threshold");
        voters = _voters;
        threshold = _threshold;
    }

    // tracking of last proposal just for convenience. Alternatively, can extract from logs
    address internal lastProposal;
    address internal lastProposalCreator;

    function last() external view returns (address, address) {
        return (lastProposal, lastProposalCreator);
    }

    event Proposed(address indexed votingAddr);

    function proposeDCall(address target, uint256 gas) external returns (address) {
        address votingAddr = address(new Voting(voters, msg.sender, threshold, target, gas, 0, true, abi.encodeWithSignature("execute()")));
        isActive[votingAddr] = true;
        emit Proposed(votingAddr);
        lastProposal = votingAddr;
        lastProposalCreator = msg.sender;
        return votingAddr;
    }

    function proposeCall(address target, uint256 gas, uint256 amount, bytes calldata data) external returns (address) {
        address votingAddr = address(new Voting(voters, msg.sender, threshold, target, gas, amount, false, data));
        isActive[votingAddr] = true;
        emit Proposed(votingAddr);
        lastProposal = votingAddr;
        lastProposalCreator = msg.sender;
        return votingAddr;
    }

    event Executed(address indexed votingAddr, bool success, bytes result);

    // _execute voting.finalize is the entry point for finalization, not this method
    function _execute(address target, uint256 _gas, uint256 amount, bool delegateCall, bytes calldata data) external {
        require(isActive[msg.sender], "must be called by a voting contract");
        delete isActive[msg.sender];
        // It's important that we call after erasing (protection against Re-Entrancy)
        require(gasleft() >= _gas + 35000, "not enough gas");
        bool success;
        bytes memory result;
        if (delegateCall) {
            (success, result) = target.delegatecall.gas(_gas)(data);
        } else {
            (success, result) = target.call.gas(_gas).value(amount)(data);
        }
        emit Executed(msg.sender, success, result);
    }

    // debug is used for checking if a call will be successful
    function debug(address target, uint256 amount, bool delegateCall, bytes calldata data) external {
        bool success;
        bytes memory result;
        if (delegateCall) {
            (success, result) = target.delegatecall(data);
        } else {
            (success, result) = target.call.value(amount)(data);
        }
        if (success) {
            revert("success");
        }
        revert(string(result));
    }
}
