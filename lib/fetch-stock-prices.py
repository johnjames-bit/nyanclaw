#!/usr/bin/env python3
"""
Stock data fetcher with historical candles for Ψ-EMA
Usage: python fetch-stock-prices.py <TICKER> [PERIOD]
"""

import sys
import json
import yfinance as yf
import math

def sanitize_ticker(ticker):
    """Validate and clean ticker symbol"""
    return ticker.upper().replace('^', '').strip()

def calculate_ema(series, period):
    """Calculate EMA for a series"""
    if len(series) < period:
        return None
    multiplier = 2 / (period + 1)
    ema = series.iloc[0]
    for val in series.iloc[1:]:
        ema = (val * multiplier) + (ema * (1 - multiplier))
    return ema

def get_stock_data(ticker, period='1y', end_date=None):
    try:
        ticker = sanitize_ticker(ticker)
        stock = yf.Ticker(ticker)
        
        # Get historical data for multiple timeframes
        # If end_date specified, fetch up to that date
        if end_date:
            hist_daily = stock.history(period='3mo', interval='1d', end=end_date)
            hist_weekly = stock.history(period='13mo', interval='1wk', end=end_date)
            hist_monthly = stock.history(period='5y', interval='1mo', end=end_date)
        else:
            hist_daily = stock.history(period='3mo', interval='1d')
            hist_weekly = stock.history(period='13mo', interval='1wk')
            hist_monthly = stock.history(period='5y', interval='1mo')
        
        if hist_daily.empty:
            return {"error": f"No data found for {ticker}"}
        
        # Current data
        current_price = hist_daily['Close'].iloc[-1]
        prev_price = hist_daily['Close'].iloc[-2] if len(hist_daily) > 1 else current_price
        
        # Daily timeframe calculations
        daily_ema_34 = calculate_ema(hist_daily['Close'], 34)
        daily_ema_55 = calculate_ema(hist_daily['Close'], 55)
        daily_ema_21 = calculate_ema(hist_daily['Close'], 21)
        daily_ema_13 = calculate_ema(hist_daily['Close'], 13)
        
        # Weekly timeframe calculations
        weekly_ema_34 = calculate_ema(hist_weekly['Close'], 34)
        weekly_ema_55 = calculate_ema(hist_weekly['Close'], 55)
        weekly_ema_21 = calculate_ema(hist_weekly['Close'], 21)
        weekly_ema_13 = calculate_ema(hist_weekly['Close'], 13)
        
        # Calculate theta (phase angle) from actual price flow
        # θ = atan2(Δprice, price) - true north is 0°, +θ rising, -θ falling
        def calc_theta_from_flow(prices):
            if len(prices) < 2:
                return 0
            current = prices.iloc[-1]
            prev = prices.iloc[-2]
            delta = current - prev
            # atan2(delta, price) gives phase angle in radians
            theta_rad = math.atan2(delta, prev)
            theta_deg = math.degrees(theta_rad)
            return round(theta_deg, 2)
        
        # Calculate z-score (anomaly) from median deviation
        def calc_z(prices, current):
            if len(prices) < 21:
                return 0
            median = prices.median()
            mad = (prices - median).abs().median()
            if mad == 0:
                return 0
            z = (current - median) / mad
            return round(z, 2)
        
        # Calculate R (convergence ratio) = z(t) / z(t-1)
        # Uses 34-period rolling window (matches EMA-34 for consistency)
        def calc_r(prices):
            if len(prices) < 35:
                return 1.0
            # Use 34-period rolling z-score (Fibo, matches EMA-34)
            def rolling_z(series, lookback=34):
                if len(series) < lookback:
                    return None
                recent = series.iloc[-lookback:]
                median = recent.median()
                mad = (recent - median).abs().median()
                if mad == 0 or mad is None:
                    return None
                return (series.iloc[-1] - median) / mad
            
            z_curr = rolling_z(prices, 34)
            z_prev = rolling_z(prices.iloc[:-1], 34) if len(prices) > 34 else None
            
            if z_curr is None or z_prev is None or z_prev == 0:
                return 1.0
            r = z_curr / z_prev
            return round(max(-5, min(5, r)), 2)
        
        # Daily dimensions (using actual price flow)
        daily_theta = calc_theta_from_flow(hist_daily['Close'])
        daily_z = calc_z(hist_daily['Close'], current_price)
        daily_r = calc_r(hist_daily['Close'])
        
        # Weekly dimensions (using actual price flow)
        weekly_theta = calc_theta_from_flow(hist_weekly['Close'])
        weekly_z = calc_z(hist_weekly['Close'], hist_weekly['Close'].iloc[-1])
        weekly_r = calc_r(hist_weekly['Close'])
        
        # 52 week calculations
        hist_1y = stock.history(period='1y')
        fifty_two_week_high = hist_1y['High'].max()
        fifty_two_week_low = hist_1y['Low'].min()
        
        # Info data
        info = stock.info
        
        result = {
            "symbol": ticker,
            "shortName": info.get('shortName', None),
            "longName": info.get('longName', None),
            "sector": info.get('sector', None),
            "industry": info.get('industry', None),
            
            # Current price data
            "currentPrice": current_price,
            "regularMarketChange": current_price - prev_price,
            "regularMarketChangePercent": ((current_price - prev_price) / prev_price * 100) if prev_price != 0 else 0,
            "regularMarketDayHigh": hist_daily['High'].iloc[-1],
            "regularMarketDayLow": hist_daily['Low'].iloc[-1],
            "regularMarketOpen": hist_daily['Open'].iloc[-1],
            "regularMarketVolume": int(hist_daily['Volume'].iloc[-1]),
            
            # Valuation
            "marketCap": info.get('marketCap', None),
            "trailingPE": info.get('trailingPE', None),
            "forwardPE": info.get('forwardPE', None),
            "pegRatio": info.get('pegRatio', None),
            "priceToBook": info.get('priceToBook', None),
            
            # Financial health
            "debtToEquity": info.get('debtToEquity', None),
            "currentRatio": info.get('currentRatio', None),
            "quickRatio": info.get('quickRatio', None),
            "totalDebt": info.get('totalDebt', None),
            "totalCash": info.get('totalCash', None),
            
            # Profitability
            "profitMargins": info.get('profitMargins', None),
            "operatingMargins": info.get('operatingMargins', None),
            "returnOnEquity": info.get('returnOnEquity', None),
            "returnOnAssets": info.get('returnOnAssets', None),
            
            # Growth
            "revenueGrowth": info.get('revenueGrowth', None),
            "earningsGrowth": info.get('earningsGrowth', None),
            
            # 52 week
            "fiftyTwoWeekHigh": fifty_two_week_high,
            "fiftyTwoWeekLow": fifty_two_week_low,
            "fiftyTwoWeekChange": info.get('52WeekChange', None),
            
            # Analyst
            "targetMeanPrice": info.get('targetMeanPrice', None),
            "recommendationKey": info.get('recommendationKey', None),
            
            # Ψ-EMA Daily (3-month window)
            "psi_ema_daily": {
                "theta": daily_theta,
                "z": daily_z,
                "r": daily_r,
                "ema_34": daily_ema_34,
                "ema_55": daily_ema_55,
                "ema_21": daily_ema_21,
                "ema_13": daily_ema_13,
                "window": "3mo",
                "candles": len(hist_daily)
            },
            
            # Ψ-EMA Weekly (13-month window)
            "psi_ema_weekly": {
                "theta": weekly_theta,
                "z": weekly_z,
                "r": weekly_r,
                "ema_34": weekly_ema_34,
                "ema_55": weekly_ema_55,
                "ema_21": weekly_ema_21,
                "ema_13": weekly_ema_13,
                "window": "13mo",
                "candles": len(hist_weekly)
            },
            
            "currency": info.get('currency', 'USD'),
            "exchange": info.get('exchange', None),
            "quoteType": info.get('quoteType', None),
            "marketState": info.get('marketState', 'REGULAR'),
            "dataTimestamp": str(hist_daily.index[-1])
        }
        
        return result
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python fetch-stock-prices.py <TICKER> [PERIOD] [END_DATE]"}))
        sys.exit(1)
    
    ticker = sys.argv[1]
    period = sys.argv[2] if len(sys.argv) > 2 else '1y'
    end_date = sys.argv[3] if len(sys.argv) > 3 else None
    
    result = get_stock_data(ticker, period, end_date)
    print(json.dumps(result))
