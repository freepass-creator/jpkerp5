from flask import Flask, redirect, render_template, url_for

app = Flask(__name__)


@app.route('/')
def index():
    return redirect(url_for('home'))




@app.route('/home')
def home():
    return render_template('15_home.html', page_title='홈')


@app.route('/login')
def login():
    return render_template('01_login.html', page_title='로그인')


@app.route('/signup')
def signup():
    return render_template('02_signup.html', page_title='회원가입')


@app.route('/product-new')
def product_new():
    return render_template('03_product_new.html', page_title='상품등록')


@app.route('/product-list')
def product_list():
    return render_template('04_product_list.html', page_title='상품목록')


@app.route('/chat')
def chat():
    return render_template('05_chat.html', page_title='채팅')


@app.route('/settings')
def settings():
    return render_template('06_settings.html', page_title='설정')


@app.route('/partner')
def partner():
    return render_template('07_partner.html', page_title='파트너사관리')


@app.route('/member')
def member():
    return render_template('08_member.html', page_title='회원관리')


@app.route('/codes')
def codes():
    return render_template('09_codes.html', page_title='코드관리')


@app.route('/terms')
def terms():
    return render_template('10_terms.html', page_title='정책관리')


@app.route('/reset-password')
def reset_password():
    return render_template('14_reset_password.html', page_title='비밀번호재설정')


@app.route('/contract')
def contract():
    return render_template('11_contract.html', page_title='계약관리')


@app.route('/settlement')
def settlement():
    return render_template('12_settlement.html', page_title='정산관리')


@app.route('/request')
def request_page():
    return render_template('13_request.html', page_title='요청하기')


if __name__ == '__main__':
    app.run(debug=True, port=7000)
