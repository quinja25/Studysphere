"""
Retries downloading failed IB Chemistry past papers.
Run: python download_chemistry_retry.py
"""

import os
import re
import urllib.parse
import time
import requests

BASE_URL = "https://arrib.qzz.io/IB%20PAST%20PAPERS%20-%20YEAR/"
FILE_PATHS_URL = "https://arrib.qzz.io/Download%20past%20papers%20by%20subjects/file-paths.txt"
OUTPUT_DIR = r"C:\Users\jaeyo\OneDrive\Desktop\업무용\Chemistry Past Papers"

FAILED = [
    "2011/May 2011/Chemistry_paper_2_TZ2_SL.pdf",
    "2011/May 2011/Chemistry_paper_1_TZ1_HL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_1_TZ2_SL.pdf",
    "2011/May 2011/Chemistry_paper_1_TZ1_SL.pdf",
    "2011/May 2011/Chemistry_paper_1_TZ2_SL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_3_TZ2_SL.pdf",
    "2011/May 2011/Chemistry_paper_2_TZ2_SL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_1_TZ1_HL.pdf",
    "2011/May 2011/Chemistry_paper_3_TZ1_SL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_2_TZ1_HL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_1_TZ2_HL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_3_TZ1_SL.pdf",
    "2011/May 2011/Chemistry_paper_2_TZ2_HL.pdf",
    "2011/May 2011/Chemistry_paper_2_TZ1_SL.pdf",
    "2011/May 2011/Chemistry_paper_3_TZ1_HL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_1_TZ2_HL.pdf",
    "2011/May 2011/Chemistry_paper_2_TZ1_SL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_3_TZ2_HL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_3_TZ2_SL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_1_TZ1_SL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_3_TZ2_HL.pdf",
    "2011/May 2011/Chemistry_paper_2_TZ2_HL_markscheme.pdf",
    "2011/May 2011/Chemistry_paper_2_TZ1_HL.pdf",
    "2011/November 2011/Chemistry_paper_2_SL.pdf",
    "2011/November 2011/Chemistry_paper_3_HL_markscheme.pdf",
    "2011/November 2011/Chemistry_paper_1_SL_markscheme.pdf",
    "2011/November 2011/Chemistry_paper_2_HL_markscheme.pdf",
    "2011/November 2011/Chemistry_paper_1_HL.pdf",
    "2011/November 2011/Chemistry_paper_2_SL_markscheme.pdf",
    "2011/November 2011/Chemistry_paper_3_HL.pdf",
    "2011/November 2011/Chemistry_paper_1_SL.pdf",
    "2011/November 2011/Chemistry_paper_3_SL.pdf",
    "2011/November 2011/Chemistry_paper_2_HL.pdf",
    "2011/November 2011/Chemistry_paper_1_HL_markscheme.pdf",
    "2011/November 2011/Chemistry_paper_3_SL_markscheme.pdf",
    "2024/May 2024/Chemistry_paper_3__TZ2_SL_markscheme.pdf",
    "2024/November 2024/Chemistry_paper_3__SL_markscheme.pdf",
    "2024/November 2024/Chemistry_paper_2__SL_markscheme.pdf",
    "2023/May 2023/Chemistry_paper_3__TZ2_SL_markscheme.pdf",
    "2023/May 2023/Chemistry_paper_1__TZ2_SL_markscheme.pdf",
    "2023/May 2023/Chemistry_paper_2__TZ2_SL_markscheme.pdf",
    "2023/May 2023/Chemistry_paper_1__TZ2_SL.pdf",
    "2023/May 2023/Chemistry_paper_3__TZ2_HL.pdf",
    "2023/November 2023/Chemistry_paper_2__TZ2_HL.pdf",
    "2023/November 2023/Chemistry_paper_1__TZ1_SL.pdf",
    "2023/November 2023/Chemistry_paper_3__TZ2_HL_markscheme.pdf",
    "2023/November 2023/Chemistry_paper_1__TZ2_SL_markscheme.pdf",
    "2023/November 2023/Chemistry_paper_1__TZ1_HL.pdf",
    "2022/May 2022/Chemistry_paper_1__TZ1_SL.pdf",
    "2022/May 2022/Chemistry_paper_2__TZ2_SL.pdf",
    "2022/May 2022/Chemistry_paper_2__TZ2_HL_markscheme.pdf",
    "2022/May 2022/Chemistry_paper_2__TZ1_HL_markscheme.pdf",
    "2022/May 2022/Chemistry_paper_2__TZ1_SL_markscheme.pdf",
    "2017/May 2017/Chemistry_paper_1__TZ2_HL.pdf",
    "2017/May 2017/Chemistry_paper_1__TZ1_SL_markscheme.pdf",
    "2017/May 2017/Chemistry_paper_3__TZ2_SL_markscheme.pdf",
    "2017/May 2017/Chemistry_paper_3__TZ2_HL_markscheme.pdf",
    "2017/May 2017/Chemistry_paper_2__TZ1_HL.pdf",
    "2017/May 2017/Chemistry_paper_1__TZ1_HL_markscheme.pdf",
    "2017/May 2017/Chemistry_paper_2__TZ1_SL.pdf",
    "2017/May 2017/Chemistry_paper_1__TZ2_HL_markscheme.pdf",
    "2017/May 2017/Chemistry_paper_1__TZ2_SL_markscheme.pdf",
    "2017/May 2017/Chemistry_paper_1__TZ1_HL.pdf",
    "2017/May 2017/Chemistry_paper_2__TZ2_SL_markscheme.pdf",
    "2017/May 2017/Chemistry_paper_1__TZ2_SL.pdf",
    "2017/May 2017/Chemistry_paper_3__TZ2_HL.pdf",
    "2017/November 2017/Chemistry_paper_2__HL.pdf",
    "2017/November 2017/Chemistry_paper_1__HL_markscheme.pdf",
    "2017/November 2017/Chemistry_paper_3__SL_markscheme.pdf",
    "2017/November 2017/Chemistry_paper_3__HL_markscheme.pdf",
    "2017/November 2017/Chemistry_paper_1__SL.pdf",
    "2017/November 2017/Chemistry_paper_3__SL.pdf",
    "2017/November 2017/Chemistry_paper_2__SL_markscheme.pdf",
    "2017/November 2017/Chemistry_paper_1__HL.pdf",
    "2017/November 2017/Chemistry_paper_2__HL_markscheme.pdf",
    "2017/November 2017/Chemistry_paper_3__HL.pdf",
    "2017/November 2017/Chemistry_paper_2__SL.pdf",
    "2017/November 2017/Chemistry_paper_1__SL_markscheme.pdf",
    "2018/May 2018/Chemistry_paper_3__TZ2_SL.pdf",
    "2018/May 2018/Chemistry_paper_2__TZ2_HL.pdf",
    "2018/May 2018/Chemistry_paper_1__TZ1_SL.pdf",
    "2018/May 2018/Chemistry_paper_3__TZ1_SL.pdf",
    "2018/May 2018/Chemistry_paper_3__TZ1_HL_markscheme.pdf",
    "2018/May 2018/Chemistry_paper_2__TZ2_SL.pdf",
    "2018/May 2018/Chemistry_paper_3__TZ1_SL_markscheme.pdf",
    "2018/May 2018/Chemistry_paper_2__TZ2_HL_markscheme.pdf",
    "2018/November 2018/Chemistry_paper_1__HL_markscheme.pdf",
    "2018/November 2018/Chemistry_paper_3__SL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_3_TZ2_SL.pdf",
    "2015/May 2015/Chemistry_paper_2_TZ2_SL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_1_TZ1_HL.pdf",
    "2015/May 2015/Chemistry_paper_3_TZ1_SL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_2_TZ1_HL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_1_TZ2_HL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_3_TZ1_SL.pdf",
    "2015/May 2015/Chemistry_paper_2_TZ2_HL.pdf",
    "2015/May 2015/Chemistry_paper_2_TZ1_SL.pdf",
    "2015/May 2015/Chemistry_paper_3_TZ1_HL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_1_TZ2_HL.pdf",
    "2015/May 2015/Chemistry_paper_2_TZ1_SL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_3_TZ2_HL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_3_TZ2_SL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_1_TZ1_SL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_3_TZ2_HL.pdf",
    "2015/May 2015/Chemistry_paper_2_TZ2_HL_markscheme.pdf",
    "2015/May 2015/Chemistry_paper_2_TZ1_HL.pdf",
    "2021/November 2021/Chemistry_paper_2__HL.pdf",
    "2021/November 2021/Chemistry_paper_1__HL_markscheme.pdf",
    "2021/November 2021/Chemistry_paper_1__SL.pdf",
    "2021/November 2021/Chemistry_paper_2__SL_markscheme.pdf",
    "2021/November 2021/Chemistry_paper_1__HL.pdf",
    "2021/November 2021/Chemistry_paper_2__HL_markscheme.pdf",
    "2021/November 2021/Chemistry_paper_2__SL.pdf",
    "2021/November 2021/Chemistry_paper_1__SL_markscheme.pdf",
    "2021/May 2021/Chemistry_paper_2__TZ2_HL.pdf",
    "2021/May 2021/Chemistry_paper_1__TZ1_SL.pdf",
    "2021/May 2021/Chemistry_paper_2__TZ2_SL.pdf",
    "2021/May 2021/Chemistry_paper_2__TZ2_HL_markscheme.pdf",
    "2021/May 2021/Chemistry_paper_2__TZ1_SL_markscheme.pdf",
    "2021/May 2021/Chemistry_paper_1__TZ2_HL.pdf",
    "2021/May 2021/Chemistry_paper_1__TZ1_SL_markscheme.pdf",
    "2021/May 2021/Chemistry_paper_2__TZ1_SL.pdf",
    "2021/May 2021/Chemistry_paper_1__TZ2_HL_markscheme.pdf",
    "2021/May 2021/Chemistry_paper_1__TZ2_SL_markscheme.pdf",
    "2021/May 2021/Chemistry_paper_2__TZ2_SL_markscheme.pdf",
    "2021/May 2021/Chemistry_paper_1__TZ2_SL.pdf",
    "2016/May 2016/Chemistry_paper_2__HL.pdf",
    "2016/May 2016/Chemistry_paper_1__HL_markscheme.pdf",
    "2016/May 2016/Chemistry_paper_3__SL_markscheme.pdf",
    "2016/May 2016/Chemistry_paper_2__TZ2_HL_markscheme.pdf",
    "2016/May 2016/Chemistry_paper_3__HL_markscheme.pdf",
    "2016/May 2016/Chemistry_paper_1__SL.pdf",
    "2016/May 2016/Chemistry_paper_3__TZ2_SL_markscheme.pdf",
    "2016/May 2016/Chemistry_paper_3__TZ2_HL_markscheme.pdf",
    "2016/May 2016/Chemistry_paper_3__SL.pdf",
    "2016/May 2016/Chemistry_paper_2__SL_markscheme.pdf",
    "2016/May 2016/Chemistry_paper_1__HL.pdf",
    "2016/May 2016/Chemistry_paper_2__HL_markscheme.pdf",
    "2016/May 2016/Chemistry_paper_3__HL.pdf",
    "2016/May 2016/Chemistry_paper_2__SL.pdf",
    "2016/May 2016/Chemistry_paper_2__TZ2_SL_markscheme.pdf",
    "2016/May 2016/Chemistry_paper_1__SL_markscheme.pdf",
    "2016/November 2016/Chemistry_paper_2__HL.pdf",
    "2016/November 2016/Chemistry_paper_1__HL_markscheme.pdf",
    "2016/November 2016/Chemistry_paper_3__SL_markscheme.pdf",
    "2016/November 2016/Chemistry_paper_3__HL_markscheme.pdf",
    "2016/November 2016/Chemistry_paper_1__SL.pdf",
    "2016/November 2016/Chemistry_paper_3__SL.pdf",
    "2016/November 2016/Chemistry_paper_2__SL_markscheme.pdf",
    "2010/November 2010/Chemistry_paper_1_HL.pdf",
    "2010/November 2010/Chemistry_paper_2_SL_markscheme.pdf",
    "2010/November 2010/Chemistry_paper_3_HL.pdf",
    "2010/November 2010/Chemistry_paper_1_SL.pdf",
    "2010/November 2010/Chemistry_paper_3_SL.pdf",
    "2010/November 2010/Chemistry_paper_2_HL.pdf",
    "2010/November 2010/Chemistry_paper_1_HL_markscheme.pdf",
    "2010/November 2010/Chemistry_paper_3_SL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_2_TZ2_SL.pdf",
    "2010/May 2010/Chemistry_paper_3_TZ1_HL.pdf",
    "2010/May 2010/Chemistry_paper_1_TZ1_HL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_1_TZ2_SL.pdf",
    "2010/May 2010/Chemistry_paper_1_TZ1_SL.pdf",
    "2010/May 2010/Chemistry_paper_1_TZ2_SL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_3_TZ2_SL.pdf",
    "2010/May 2010/Chemistry_paper_2_TZ2_SL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_1_TZ1_HL.pdf",
    "2010/May 2010/Chemistry_paper_3_TZ1_SL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_2_TZ1_HL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_1_TZ2_HL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_3_TZ1_SL.pdf",
    "2010/May 2010/Chemistry_paper_2_TZ2_HL.pdf",
    "2010/May 2010/Chemistry_paper_2_TZ1_SL.pdf",
    "2010/May 2010/Chemistry_paper_3_TZ1_HL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_1_TZ2_HL.pdf",
    "2010/May 2010/Chemistry_paper_2_TZ1_SL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_3_TZ2_HL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_3_TZ2_SL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_1_TZ1_SL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_3_TZ2_HL.pdf",
    "2010/May 2010/Chemistry_paper_2_TZ2_HL_markscheme.pdf",
    "2010/May 2010/Chemistry_paper_2_TZ1_HL.pdf",
    "2020/November 2020/Chemistry_paper_2__HL.pdf",
    "2020/November 2020/Chemistry_paper_1__HL_markscheme.pdf",
    "2020/November 2020/Chemistry_paper_3__SL_markscheme.pdf",
    "2020/November 2020/Chemistry_paper_3__HL_markscheme.pdf",
    "2020/November 2020/Chemistry_paper_1__SL.pdf",
    "2020/November 2020/Chemistry_paper_3__SL.pdf",
    "2020/November 2020/Chemistry_paper_2__SL_markscheme.pdf",
    "2020/November 2020/Chemistry_paper_1__HL.pdf",
    "2020/November 2020/Chemistry_paper_2__HL_markscheme.pdf",
    "2020/November 2020/Chemistry_paper_3__HL.pdf",
    "2020/November 2020/Chemistry_paper_2__SL.pdf",
    "2020/November 2020/Chemistry_paper_1__SL_markscheme.pdf",
    "2013/November 2013/Chemistry_paper_2_SL.pdf",
    "2013/November 2013/Chemistry_paper_3_HL_markscheme.pdf",
    "2013/November 2013/Chemistry_paper_1_SL_markscheme.pdf",
    "2013/November 2013/Chemistry_paper_2_HL_markscheme.pdf",
    "2013/November 2013/Chemistry_paper_1_HL.pdf",
    "2013/November 2013/Chemistry_paper_2_SL_markscheme.pdf",
    "2013/November 2013/Chemistry_paper_3_HL.pdf",
    "2013/November 2013/Chemistry_paper_1_SL.pdf",
    "2013/November 2013/Chemistry_paper_3_SL.pdf",
    "2013/November 2013/Chemistry_paper_2_HL.pdf",
    "2013/November 2013/Chemistry_paper_1_HL_markscheme.pdf",
    "2013/November 2013/Chemistry_paper_3_SL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_2_TZ2_SL.pdf",
    "2013/May 2013/Chemistry_paper_3_TZ1_HL.pdf",
    "2013/May 2013/Chemistry_paper_1_TZ1_HL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_1_TZ2_SL.pdf",
    "2013/May 2013/Chemistry_paper_1_TZ1_SL.pdf",
    "2013/May 2013/Chemistry_paper_1_TZ2_SL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_3_TZ2_SL.pdf",
    "2013/May 2013/Chemistry_paper_2_TZ2_SL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_1_TZ1_HL.pdf",
    "2013/May 2013/Chemistry_paper_3_TZ1_SL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_2_TZ1_HL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_1_TZ2_HL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_3_TZ1_SL.pdf",
    "2013/May 2013/Chemistry_paper_2_TZ2_HL.pdf",
    "2013/May 2013/Chemistry_paper_2_TZ1_SL.pdf",
    "2013/May 2013/Chemistry_paper_3_TZ1_HL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_1_TZ2_HL.pdf",
    "2013/May 2013/Chemistry_paper_2_TZ1_SL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_3_TZ2_HL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_3_TZ2_SL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_1_TZ1_SL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_3_TZ2_HL.pdf",
    "2013/May 2013/Chemistry_paper_2_TZ2_HL_markscheme.pdf",
    "2013/May 2013/Chemistry_paper_2_TZ1_HL.pdf",
    "2019/May 2019/Chemistry_paper_3__TZ2_SL.pdf",
    "2019/May 2019/Chemistry_paper_2__TZ2_HL.pdf",
    "2019/May 2019/Chemistry_paper_1__TZ1_SL.pdf",
    "2019/May 2019/Chemistry_paper_3__TZ1_SL.pdf",
    "2019/May 2019/Chemistry_paper_3__TZ1_HL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_2__TZ2_SL.pdf",
    "2019/May 2019/Chemistry_paper_3__TZ1_SL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_2__TZ2_HL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_2__TZ1_HL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_2__TZ1_SL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_3__TZ1_HL.pdf",
    "2019/May 2019/Chemistry_paper_1__TZ2_HL.pdf",
    "2019/May 2019/Chemistry_paper_1__TZ1_SL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_3__TZ2_SL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_3__TZ2_HL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_2__TZ1_HL.pdf",
    "2019/May 2019/Chemistry_paper_1__TZ1_HL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_2__TZ1_SL.pdf",
    "2019/May 2019/Chemistry_paper_1__TZ2_HL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_1__TZ2_SL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_1__TZ1_HL.pdf",
    "2019/May 2019/Chemistry_paper_2__TZ2_SL_markscheme.pdf",
    "2019/May 2019/Chemistry_paper_1__TZ2_SL.pdf",
    "2019/May 2019/Chemistry_paper_3__TZ2_HL.pdf",
    "2019/November 2019/Chemistry_paper_2__HL.pdf",
    "2019/November 2019/Chemistry_paper_1__HL_markscheme.pdf",
    "2019/November 2019/Chemistry_paper_3__SL_markscheme.pdf",
    "2019/November 2019/Chemistry_paper_3__HL_markscheme.pdf",
    "2019/November 2019/Chemistry_paper_1__SL.pdf",
    "2019/November 2019/Chemistry_paper_3__SL.pdf",
    "2019/November 2019/Chemistry_paper_2__SL_markscheme.pdf",
    "2019/November 2019/Chemistry_paper_1__HL.pdf",
    "2019/November 2019/Chemistry_paper_2__HL_markscheme.pdf",
    "2019/November 2019/Chemistry_paper_3__HL.pdf",
    "2019/November 2019/Chemistry_paper_2__SL.pdf",
    "2019/November 2019/Chemistry_paper_1__SL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_2_TZ2_SL.pdf",
    "2014/May 2014/Chemistry_paper_3_TZ1_HL.pdf",
    "2014/May 2014/Chemistry_paper_1_TZ1_HL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_1_TZ2_SL.pdf",
    "2014/May 2014/Chemistry_paper_1_TZ1_SL.pdf",
    "2014/May 2014/Chemistry_paper_1_TZ2_SL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_3_TZ2_SL.pdf",
    "2014/May 2014/Chemistry_paper_2_TZ2_SL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_1_TZ1_HL.pdf",
    "2014/May 2014/Chemistry_paper_3_TZ1_SL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_2_TZ1_HL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_1_TZ2_HL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_3_TZ1_SL.pdf",
    "2014/May 2014/Chemistry_paper_2_TZ2_HL.pdf",
    "2014/May 2014/Chemistry_paper_2_TZ1_SL.pdf",
    "2014/May 2014/Chemistry_paper_3_TZ1_HL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_1_TZ2_HL.pdf",
    "2014/May 2014/Chemistry_paper_2_TZ1_SL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_3_TZ2_HL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_3_TZ2_SL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_1_TZ1_SL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_3_TZ2_HL.pdf",
    "2014/May 2014/Chemistry_paper_2_TZ2_HL_markscheme.pdf",
    "2014/May 2014/Chemistry_paper_2_TZ1_HL.pdf",
    "2014/November 2014/Chemistry_paper_2_SL.pdf",
    "2014/November 2014/Chemistry_paper_3_HL_markscheme.pdf",
    "2014/November 2014/Chemistry_paper_1_SL_markscheme.pdf",
    "2014/November 2014/Chemistry_paper_2_HL_markscheme.pdf",
    "2014/November 2014/Chemistry_paper_1_HL.pdf",
    "2014/November 2014/Chemistry_paper_2_SL_markscheme.pdf",
    "2014/November 2014/Chemistry_paper_3_HL.pdf",
    "2014/November 2014/Chemistry_paper_1_SL.pdf",
    "2014/November 2014/Chemistry_paper_3_SL.pdf",
    "2014/November 2014/Chemistry_paper_2_HL.pdf",
    "2014/November 2014/Chemistry_paper_1_HL_markscheme.pdf",
    "2014/November 2014/Chemistry_paper_3_SL_markscheme.pdf",
    "2025/May 2025/Chemistry_paper_2_TZ2_SL.pdf",
    "2025/May 2025/Chemistry_paper_1A_TZ3_HL_markscheme.pdf",
    "2025/May 2025/Chemistry_paper_1A_TZ2_HL.pdf",
    "2025/May 2025/Chemistry_paper_1A_TZ1_SL.pdf",
    "2025/May 2025/Chemistry_paper_2_TZ3_SL_markscheme.pdf",
    "2025/May 2025/Chemistry_paper_2_TZ1_SL.pdf",
    "2025/May 2025/Chemistry_paper_1A_TZ3_SL_markscheme.pdf",
    "2025/May 2025/Chemistry_paper_2_TZ1_SL_markscheme.pdf",
    "2025/May 2025/Chemistry_paper_1A_TZ2_SL_markscheme.pdf",
    "2025/November 2025/Chemistry_paper_1A_TZ3_SL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_2_TZ2_SL.pdf",
    "2012/May 2012/Chemistry_paper_3_TZ1_HL.pdf",
    "2012/May 2012/Chemistry_paper_1_TZ1_HL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_1_TZ2_SL.pdf",
    "2012/May 2012/Chemistry_paper_1_TZ1_SL.pdf",
    "2012/May 2012/Chemistry_paper_1_TZ2_SL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_3_TZ2_SL.pdf",
    "2012/May 2012/Chemistry_paper_2_TZ2_SL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_1_TZ1_HL.pdf",
    "2012/May 2012/Chemistry_paper_3_TZ1_SL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_2_TZ1_HL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_1_TZ2_HL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_3_TZ1_SL.pdf",
    "2012/May 2012/Chemistry_paper_2_TZ2_HL.pdf",
    "2012/May 2012/Chemistry_paper_2_TZ1_SL.pdf",
    "2012/May 2012/Chemistry_paper_3_TZ1_HL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_1_TZ2_HL.pdf",
    "2012/May 2012/Chemistry_paper_2_TZ1_SL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_3_TZ2_HL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_3_TZ2_SL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_1_TZ1_SL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_3_TZ2_HL.pdf",
    "2012/May 2012/Chemistry_paper_2_TZ2_HL_markscheme.pdf",
    "2012/May 2012/Chemistry_paper_2_TZ1_HL.pdf",
    "2012/November 2012/Chemistry_paper_2_SL.pdf",
    "2012/November 2012/Chemistry_paper_3_HL_markscheme.pdf",
    "2012/November 2012/Chemistry_paper_1_SL_markscheme.pdf",
    "2012/November 2012/Chemistry_paper_2_HL_markscheme.pdf",
    "2012/November 2012/Chemistry_paper_1_HL.pdf",
    "2012/November 2012/Chemistry_paper_2_SL_markscheme.pdf",
    "2012/November 2012/Chemistry_paper_3_HL.pdf",
    "2012/November 2012/Chemistry_paper_1_SL.pdf",
    "2012/November 2012/Chemistry_paper_3_SL.pdf",
    "2012/November 2012/Chemistry_paper_2_HL.pdf",
    "2012/November 2012/Chemistry_paper_1_HL_markscheme.pdf",
    "2012/November 2012/Chemistry_paper_3_SL_markscheme.pdf",
]


def build_lookup(all_paths):
    """Build a dict: (session_label, filename) -> full raw path."""
    lookup = {}
    for p in all_paths:
        m = re.search(r"(May|November) (\d{4})", p)
        if not m:
            continue
        session_label = f"{m.group(1)} {m.group(2)}"
        filename = p.split("/")[-1]
        lookup[(session_label, filename)] = p
    return lookup


def build_url(path):
    if path.startswith("./"):
        path = path[2:]
    parts = path.split("/")
    encoded = "/".join(urllib.parse.quote(part) for part in parts)
    return BASE_URL + encoded


def download_file(url, dest, retries=5):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, timeout=120)
            if resp.status_code == 404:
                return "not_found"
            resp.raise_for_status()
            with open(dest, "wb") as f:
                f.write(resp.content)
            return "ok"
        except Exception as e:
            if attempt == retries:
                raise
            wait = 2 ** attempt
            print(f"    Attempt {attempt} failed ({e}), retrying in {wait}s...")
            time.sleep(wait)
    return "error"


def main():
    print("Fetching file list...")
    resp = requests.get(FILE_PATHS_URL, timeout=30)
    resp.raise_for_status()
    all_paths = [line.strip() for line in resp.text.splitlines() if line.strip()]
    lookup = build_lookup(all_paths)
    print(f"Loaded {len(all_paths)} total paths. Matching {len(FAILED)} failed files...\n")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    not_found = []
    failed = []

    for i, entry in enumerate(FAILED, 1):
        parts = entry.split("/")
        session_label = parts[1]  # e.g. "May 2011"
        filename = parts[2]

        raw_path = lookup.get((session_label, filename))
        if not raw_path:
            print(f"[{i}/{len(FAILED)}] NOT IN INDEX: {entry}")
            not_found.append(entry)
            continue

        year = session_label.split()[-1]
        dest = os.path.join(OUTPUT_DIR, year, session_label, filename)

        if os.path.exists(dest):
            print(f"[{i}/{len(FAILED)}] Skipped (exists): {entry}")
            continue

        url = build_url(raw_path)
        try:
            result = download_file(url, dest)
            if result == "not_found":
                print(f"[{i}/{len(FAILED)}] 404 (skipped): {entry}")
                not_found.append(entry)
            else:
                print(f"[{i}/{len(FAILED)}] Downloaded: {entry}")
        except Exception as e:
            print(f"[{i}/{len(FAILED)}] FAILED: {entry} — {e}")
            failed.append(entry)

        time.sleep(0.5)

    print(f"\nDone! Attempted {len(FAILED)} files.")
    if not_found:
        print(f"\n{len(not_found)} not found in index:")
        for f in not_found:
            print(f"  - {f}")
    if failed:
        print(f"\n{len(failed)} download errors:")
        for f in failed:
            print(f"  - {f}")


if __name__ == "__main__":
    main()
