// SPDX-License-Identifier: MIT

pragma solidity >0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./DexRip/interfaces/IRipPair.sol";
import "./DexRip/interfaces/IRipRouter01.sol";
import "./DexRip/interfaces/IRipFactory.sol";
import "./DexRip/libraries/RipLibrary.sol";

// RipRoll helps your migrate your existing Uniswap LP tokens to DexRip LP ones
contract RipRoll is Ownable {
    using SafeERC20 for IERC20;

    IRipRouter01 public oldRouter;
    IRipRouter01 public router;
    IERC20 public hatToken = IERC20(0x82FE038Ea4b50f9C957da326C412ebd73462077C);

    constructor(IRipRouter01 _oldRouter, IRipRouter01 _router) public {
        oldRouter = _oldRouter;
        router = _router;
    }

    function migrateWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        IRipPair pair = IRipPair(pairForOldRouter(tokenA, tokenB));
        pair.permit(msg.sender, address(this), liquidity, deadline, v, r, s);

        migrate(tokenA, tokenB, liquidity, amountAMin, amountBMin, deadline);
    }

    // msg.sender should have approved 'liquidity' amount of LP token of 'tokenA' and 'tokenB'
    function migrate(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline
    ) public {
        require(deadline >= block.timestamp, "RipSwap: EXPIRED");

        // Remove liquidity from the old router with permit
        (uint256 amountA, uint256 amountB) = removeLiquidity(
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin,
            deadline
        );

        // Add liquidity to the new router
        (uint256 pooledAmountA, uint256 pooledAmountB) = addLiquidity(tokenA, tokenB, amountA, amountB);

        // Send remaining tokens to msg.sender
        if (amountA > pooledAmountA) {
            IERC20(tokenA).safeTransfer(msg.sender, amountA - pooledAmountA);
        }
        if (amountB > pooledAmountB) {
            IERC20(tokenB).safeTransfer(msg.sender, amountB - pooledAmountB);
        }

        // Transfer user a single hat token if there are any remaining and user has not received one yet
        if (address(hatToken) != address(0)) {
            uint256 hatSupply = hatToken.balanceOf(address(this));
            uint256 userSupply = hatToken.balanceOf(msg.sender);
            if (hatSupply > 0 && userSupply == 0) {
                hatToken.safeTransfer(msg.sender, 1e18);
            }
        }
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline
    ) internal returns (uint256 amountA, uint256 amountB) {
        IRipPair pair = IRipPair(pairForOldRouter(tokenA, tokenB));
        pair.transferFrom(msg.sender, address(pair), liquidity);
        (uint256 amount0, uint256 amount1) = pair.burn(address(this));
        (address token0, ) = RipLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "RipRoll: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "RipRoll: INSUFFICIENT_B_AMOUNT");
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairForOldRouter(address tokenA, address tokenB) internal view returns (address pair) {
        (address token0, address token1) = RipLibrary.sortTokens(tokenA, tokenB);
        pair = address(
            uint256(
                keccak256(
                    abi.encodePacked(
                        hex"ff",
                        oldRouter.factory(),
                        keccak256(abi.encodePacked(token0, token1)),
                        hex"40231f6b438bce0797c9ada29b718a87ea0a5cea3fe9a771abdd76bd41a3e545" // init code hash
                    )
                )
            )
        );
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired
    ) internal returns (uint256 amountA, uint256 amountB) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired);
        address pair = RipLibrary.pairFor(router.factory(), tokenA, tokenB);
        IERC20(tokenA).safeTransfer(pair, amountA);
        IERC20(tokenB).safeTransfer(pair, amountB);
        IRipPair(pair).mint(msg.sender);
    }

    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired
    ) internal returns (uint256 amountA, uint256 amountB) {
        // create the pair if it doesn't exist yet
        IRipFactory factory = IRipFactory(router.factory());
        if (factory.getPair(tokenA, tokenB) == address(0)) {
            factory.createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = RipLibrary.getReserves(address(factory), tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = RipLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = RipLibrary.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
}
